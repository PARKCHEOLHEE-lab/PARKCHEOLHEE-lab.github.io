"""
Embed blog posts with OpenAI text-embedding-3-small and reduce to 2D with UMAP.
Outputs assets/data/latentspace.json for D3.js visualization.

Incremental mode: existing posts keep their xy from latentspace.json.
Only new posts are embedded and projected via cached UMAP model.
Cache files: umap_model.pkl (fitted UMAP model).
"""

import glob
import json
import os
import pickle
import re

from bs4 import BeautifulSoup
from openai import OpenAI
from umap import UMAP
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
UMAP_MODEL_PATH = os.path.join(DATA_DIR, "umap_model.pkl")


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


def load_existing_coords():
    """Load existing latentspace.json coords as {slug: {x, y}}."""
    if not os.path.exists(LATENTSPACE_PATH):
        return {}
    with open(LATENTSPACE_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return {d["slug"]: {"x": d["x"], "y": d["y"]} for d in data}


def load_umap_model():
    """Load cached UMAP model if available."""
    if not os.path.exists(UMAP_MODEL_PATH):
        return None
    with open(UMAP_MODEL_PATH, "rb") as f:
        return pickle.load(f)


def save_umap_model(reducer):
    """Save fitted UMAP model."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(UMAP_MODEL_PATH, "wb") as f:
        pickle.dump(reducer, f)


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

    existing_coords = load_existing_coords()
    cached_reducer = load_umap_model()

    new_posts = [p for p in posts if p["slug"] not in existing_coords]
    kept_posts = [p for p in posts if p["slug"] in existing_coords]

    print(f"Existing: {len(kept_posts)}, New: {len(new_posts)}")

    if len(new_posts) == 0:
        print("No new posts. Updating metadata only.")
    elif cached_reducer is not None:
        # Incremental: embed new posts, project via cached UMAP model
        new_embeddings = get_embeddings(new_posts, client)
        new_coords_2d = cached_reducer.transform(new_embeddings)

        # Map raw UMAP coords to [0,1] using the model's fitted embedding range
        raw_embedding = cached_reducer.embedding_
        raw_min = raw_embedding.min(axis=0)
        raw_max = raw_embedding.max(axis=0)
        raw_range = raw_max - raw_min

        for i, post in enumerate(new_posts):
            nx = (new_coords_2d[i, 0] - raw_min[0]) / raw_range[0] if raw_range[0] > 0 else 0.5
            ny = (new_coords_2d[i, 1] - raw_min[1]) / raw_range[1] if raw_range[1] > 0 else 0.5
            existing_coords[post["slug"]] = {
                "x": round(float(max(0, min(1, nx))), 4),
                "y": round(float(max(0, min(1, ny))), 4),
            }

        print(f"Projected {len(new_posts)} new posts via UMAP transform()")
    else:
        # Full rebuild
        print("Full rebuild (no cache found)")
        all_embeddings = get_embeddings(posts, client)

        reducer = UMAP(
            n_components=2,
            n_neighbors=15,
            min_dist=0.1,
            metric="cosine",
            random_state=42,
        )
        raw_coords = reducer.fit_transform(all_embeddings)
        coords_normalized = normalize_coords(raw_coords)

        for i, post in enumerate(posts):
            existing_coords[post["slug"]] = {
                "x": round(float(coords_normalized[i, 0]), 4),
                "y": round(float(coords_normalized[i, 1]), 4),
            }

        save_umap_model(reducer)

    # Build output
    valid_slugs = {p["slug"] for p in posts}
    output = []
    for post in posts:
        slug = post["slug"]
        coord = existing_coords.get(slug, {"x": 0.5, "y": 0.5})
        connected = [s for s in post["connected"] if s in valid_slugs and s != slug]
        output.append({
            "title": post["title"],
            "slug": slug,
            "url": post["url"],
            "category": post["category"],
            "label": post["label"],
            "connected": connected,
            "x": coord["x"],
            "y": coord["y"],
        })

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LATENTSPACE_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(output)} entries to {LATENTSPACE_PATH}")


if __name__ == "__main__":
    main()
