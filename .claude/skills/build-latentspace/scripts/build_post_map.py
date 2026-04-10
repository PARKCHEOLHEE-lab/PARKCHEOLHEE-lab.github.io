"""
Embed blog posts with OpenAI text-embedding-3-small and reduce to 2D with PCA.
Outputs data/latentspace.json for D3.js visualization.

PCA is fully deterministic: same inputs always produce identical coordinates.
Adding a post causes only minimal coordinate shifts (~1/N).
Cached embeddings avoid redundant OpenAI API calls.
"""

import glob
import json
import os
import re

from bs4 import BeautifulSoup
from openai import OpenAI
from sklearn.decomposition import PCA
import numpy as np

EMOJI_TO_LABEL = {
    "brain": "Brain",
    "books": "Books",
    "pin": "Pin",
    "eyes": "Eyes",
    "wordballoon-with-dots": "Wordballoon",
    "robot": "Robot",
    "storm": "Storm",
}

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DATA_DIR = os.path.join(REPO_ROOT, "data")
LATENTSPACE_PATH = os.path.join(DATA_DIR, "latentspace.json")
EMBEDDINGS_PATH = os.path.join(DATA_DIR, "embeddings.json")


def parse_frontmatter(raw):
    """Extract YAML frontmatter and body from an HTML post."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", raw, re.DOTALL)
    if not match:
        return {}, raw
    fm_block, body = match.group(1), match.group(2)
    fm = {}
    related = []
    in_related = False
    for line in fm_block.split("\n"):
        if line.startswith("related:"):
            in_related = True
            continue
        if in_related:
            stripped = line.strip()
            if stripped.startswith("- "):
                related.append(stripped[2:].strip())
            else:
                in_related = False
        if not in_related and ":" in line:
            key, val = line.split(":", 1)
            fm[key.strip()] = val.strip().strip('"').strip("'")
    fm["related"] = related
    return fm, body


def emoji_to_label(emoji_path):
    """Convert emoji frontmatter path to label name."""
    if not emoji_path:
        return None
    name = os.path.basename(emoji_path).rsplit(".", 1)[0]
    return EMOJI_TO_LABEL.get(name)


def strip_html(html_text):
    """Remove HTML tags, MathJax, and scripts. Return clean text."""
    soup = BeautifulSoup(html_text, "lxml")
    for tag in soup.find_all(["script", "style"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    text = re.sub(r"\\\(.*?\\\)", "", text)
    text = re.sub(r"\\\[.*?\\\]", "", text, flags=re.DOTALL)
    text = re.sub(r"\$.*?\$", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_posts():
    """Load all eligible posts from note/_posts and testbed/_posts."""
    patterns = [
        os.path.join(REPO_ROOT, "note/_posts/*.html"),
        os.path.join(REPO_ROOT, "testbed/_posts/*.html"),
    ]

    posts = []
    for pattern in patterns:
        for path in sorted(glob.glob(pattern)):
            basename = os.path.basename(path)

            if basename.startswith("_"):
                continue

            with open(path, encoding="utf-8") as f:
                raw = f.read()
            fm, body = parse_frontmatter(raw)
            title = fm.get("title", "")
            if not title:
                continue

            if not body.strip():
                continue

            slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", basename.rsplit(".", 1)[0])

            category = "testbed" if "/testbed/" in path else "note"

            label = emoji_to_label(fm.get("emoji", ""))
            if label is None:
                label = "Testbed" if category == "testbed" else "Note"

            clean_text = strip_html(body)
            embed_text = f"{title}. {clean_text}"[:32000]

            posts.append({
                "title": title,
                "slug": slug,
                "url": f"/{slug}/",
                "category": category,
                "label": label,
                "connected": fm.get("related", []),
                "embed_text": embed_text,
            })

    return posts


def get_embeddings(posts, client):
    """Batch embed posts via OpenAI API."""
    texts = [p["embed_text"] for p in posts]
    print(f"Embedding {len(texts)} posts...")
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    embeddings = [item.embedding for item in response.data]
    print(f"Got {len(embeddings)} embeddings, dim={len(embeddings[0])}")
    return np.array(embeddings)


def load_cached_embeddings():
    """Load cached embeddings as {slug: [float, ...]}."""
    if not os.path.exists(EMBEDDINGS_PATH):
        return {}
    try:
        with open(EMBEDDINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return data
    except (json.JSONDecodeError, ValueError):
        print("Warning: corrupt embeddings cache, starting fresh")
        return {}


def save_cached_embeddings(embeddings_dict):
    """Save embeddings cache."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(EMBEDDINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(embeddings_dict, f)


def normalize_coords(coords):
    """Normalize coordinates to [0, 1] range."""
    for i in range(2):
        col = coords[:, i]
        col_range = col.max() - col.min()
        if col_range > 0:
            coords[:, i] = (col - col.min()) / col_range
    return coords


def main():
    client = OpenAI()
    posts = load_posts()
    print(f"Loaded {len(posts)} posts")

    # Load cached embeddings to avoid redundant API calls
    cached_embeddings = load_cached_embeddings()
    new_slugs = [p["slug"] for p in posts if p["slug"] not in cached_embeddings]
    cached_slugs = [p["slug"] for p in posts if p["slug"] in cached_embeddings]

    print(f"Cached: {len(cached_slugs)}, New: {len(new_slugs)}")

    # Embed only new posts
    if new_slugs:
        new_posts = [p for p in posts if p["slug"] in set(new_slugs)]
        new_emb = get_embeddings(new_posts, client)
        for i, post in enumerate(new_posts):
            cached_embeddings[post["slug"]] = new_emb[i].tolist()
        print(f"Embedded {len(new_slugs)} new posts")
    else:
        print("No new posts to embed")

    # Remove deleted posts from cache
    valid_slugs = {p["slug"] for p in posts}
    stale_slugs = set(cached_embeddings.keys()) - valid_slugs
    if stale_slugs:
        cached_embeddings = {k: v for k, v in cached_embeddings.items() if k in valid_slugs}
        print(f"Pruned {len(stale_slugs)} stale entries from cache")
    save_cached_embeddings(cached_embeddings)

    # Build embedding matrix in post order
    all_embeddings = np.array([cached_embeddings[p["slug"]] for p in posts])

    # PCA to 2D — fully deterministic
    pca = PCA(n_components=2)
    coords_2d = pca.fit_transform(all_embeddings)
    coords_normalized = normalize_coords(coords_2d)

    print(f"PCA explained variance: {pca.explained_variance_ratio_}")

    # Build output
    valid_slugs = {p["slug"] for p in posts}
    output = []
    for i, post in enumerate(posts):
        slug = post["slug"]
        connected = [s for s in post["connected"] if s in valid_slugs and s != slug]
        output.append({
            "title": post["title"],
            "slug": slug,
            "url": post["url"],
            "category": post["category"],
            "label": post["label"],
            "connected": connected,
            "x": round(float(coords_normalized[i, 0]), 4),
            "y": round(float(coords_normalized[i, 1]), 4),
        })

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LATENTSPACE_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(output)} entries to {LATENTSPACE_PATH}")


if __name__ == "__main__":
    main()
