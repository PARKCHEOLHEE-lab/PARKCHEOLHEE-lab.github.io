"""
Embed blog posts with OpenAI text-embedding-3-small and reduce to 2D with UMAP.
Outputs assets/data/latentspace.json for D3.js visualization.
"""

import glob
import json
import os
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
    # Extract filename without extension: /emoji/brain.png -> brain
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

            # Skip underscore-prefixed files
            if basename.startswith("_"):
                continue

            with open(path, encoding="utf-8") as f:
                raw = f.read()
            fm, body = parse_frontmatter(raw)
            title = fm.get("title", "")
            if not title:
                continue

            slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", basename.rsplit(".", 1)[0])

            category = "testbed" if "/testbed/" in path else "note"

            # Determine label
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


def reduce_to_2d(embeddings):
    """UMAP reduction to 2D."""
    print("Running UMAP...")
    reducer = UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(embeddings)

    for i in range(2):
        col = coords[:, i]
        coords[:, i] = (col - col.min()) / (col.max() - col.min())

    return coords


def main():
    client = OpenAI()
    posts = load_posts()
    print(f"Loaded {len(posts)} posts")

    embeddings = get_embeddings(posts, client)
    coords = reduce_to_2d(embeddings)

    # Collect all valid slugs for filtering connected references
    valid_slugs = {post["slug"] for post in posts}

    output = []
    for i, post in enumerate(posts):
        connected = [s for s in post["connected"] if s in valid_slugs and s != post["slug"]]
        output.append({
            "title": post["title"],
            "slug": post["slug"],
            "url": post["url"],
            "category": post["category"],
            "label": post["label"],
            "connected": connected,
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4),
        })

    out_dir = os.path.join(REPO_ROOT, "assets", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "latentspace.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(output)} entries to {out_path}")


if __name__ == "__main__":
    main()
