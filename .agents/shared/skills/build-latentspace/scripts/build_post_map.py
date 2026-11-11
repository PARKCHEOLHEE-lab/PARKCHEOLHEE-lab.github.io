"""
Embed blog posts locally with Qwen/Qwen3-Embedding-0.6B and reduce to 2D with PCA.
Outputs assets/data/latentspace.json for D3.js visualization.

PCA is fully deterministic: same inputs always produce identical coordinates.
Adding a post causes only minimal coordinate shifts (~1/N).
Cached embeddings avoid loading the model again: a post is embedded again
only when the text it would embed differs from the text its vector came from.
"""

import fcntl
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup
from sklearn.decomposition import PCA
import numpy as np

# add-related's list_posts decides which posts are eligible, and where the repo is, for both skills
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "add-related" / "scripts"))
from list_posts import REPO_ROOT, list_posts  # noqa: E402

EMOJI_TO_LABEL = {
    "brain": "Brain",
    "books": "Books",
    "pin": "Pin",
    "eyes": "Eyes",
    "wordballoon-with-dots": "Wordballoon",
    "robot": "Robot",
    "storm": "Storm",
}

DATA_DIR = os.path.join(REPO_ROOT, "assets", "data")
LATENTSPACE_PATH = os.path.join(DATA_DIR, "latentspace.json")
EMBEDDINGS_PATH = os.path.join(DATA_DIR, "embeddings.json")
EMBEDDING_HASHES_PATH = os.path.join(DATA_DIR, "embedding-hashes.json")


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


# Posts longer than one window are split into windows and their vectors
# pooled into one (OpenAI cookbook "embedding long inputs" pattern) rather
# than truncated, so the whole post is represented instead of just its head.
# The model reads up to 32k tokens, but it was compared against the old
# OpenAI map with 4096-token windows, so that is the window. Windows are cut
# with the model's own tokenizer: character counts undercount
# dense-tokenizing text (compatibility jamo like "ㅋ", emoji, digit runs).
EMBED_MODEL = "Qwen/Qwen3-Embedding-0.6B"
EMBED_TOKEN_LIMIT = 4096

_TOKENIZER = None


def _tokenizer():
    """The model's own tokenizer, loaded once. It needs only the small tokenizer files, not torch or the weights."""
    global _TOKENIZER
    if _TOKENIZER is None:
        from transformers import AutoTokenizer
        _TOKENIZER = AutoTokenizer.from_pretrained(EMBED_MODEL)
    return _TOKENIZER


def load_model():
    """The embedding model on this Mac's GPU (MPS), or the CPU elsewhere.

    It is imported only when a post needs embedding, so a fully cached build
    and the tests run without torch or a model download.
    """
    import torch
    from sentence_transformers import SentenceTransformer
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    return SentenceTransformer(EMBED_MODEL, device=device)


def chunk_to_token_limit(text, limit=EMBED_TOKEN_LIMIT):
    """Split text into consecutive chunks that each fit the token budget.

    Text already within budget is returned as a single-element list holding
    the original string unchanged, so cached embeddings for existing posts
    stay valid. A token slice can split a multi-byte character, so any
    replacement char at a chunk boundary is stripped.
    """
    tokens = _tokenizer().encode(text, add_special_tokens=False)
    if len(tokens) <= limit:
        return [text]
    # lazy: fixed-size token windows; no sentence-boundary or overlap logic —
    # a blended theme vector for the 2D map does not need boundary fidelity.
    return [
        _tokenizer().decode(tokens[i:i + limit]).strip("�")
        for i in range(0, len(tokens), limit)
    ]


def _pool_chunk_embeddings(chunk_vectors, chunk_token_lens):
    """Combine a post's chunk embeddings into one vector.

    Token-length-weighted mean (longer chunks carry proportionally more
    weight), then L2-renormalized back onto the unit sphere so the pooled
    vector stays comparable with single-chunk embeddings, which the model
    returns at unit norm. (OpenAI cookbook pattern.)
    """
    pooled = np.average(np.array(chunk_vectors), axis=0, weights=chunk_token_lens)
    norm = np.linalg.norm(pooled)
    if norm > 0:  # numerical guard; real chunk embeddings never sum to zero
        pooled = pooled / norm
    return pooled


def load_posts():
    """Load the posts list_posts finds eligible, leaving out any without a title."""
    posts = []
    for path, slug, _title in list_posts(REPO_ROOT):
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        fm, body = parse_frontmatter(raw)
        title = fm.get("title", "")
        if not title:
            continue

        # the post's own categories, read the way _includes/post-emoji.html reads them
        category = "testbed" if "testbed" in fm.get("categories", "").split() else "note"

        label = emoji_to_label(fm.get("emoji", ""))
        if label is None:
            label = "Testbed" if category == "testbed" else "Note"

        clean_text = strip_html(body)
        embed_chunks = chunk_to_token_limit(f"{title}. {clean_text}")

        posts.append({
            "title": title,
            "slug": slug,
            "url": f"/{slug}/",
            "category": category,
            "label": label,
            "connected": fm.get("related", []),
            "embed_chunks": embed_chunks,
        })

    return posts


def get_embeddings(posts, model):
    """Embed posts with the local model, one vector per post.

    Each post carries one or more chunks (multiple only when its text exceeds
    the token budget). The chunks of all posts are encoded together; a post's
    chunk vectors are then pooled back into one vector, so the output stays
    1:1 with posts.
    """
    all_chunks = []
    spans = []  # (start index into all_chunks, [token length per chunk]) per post
    for post in posts:
        chunks = post["embed_chunks"]
        token_lens = [len(_tokenizer().encode(c, add_special_tokens=False)) for c in chunks]
        spans.append((len(all_chunks), token_lens))
        all_chunks.extend(chunks)

    print(f"Embedding {len(posts)} posts ({len(all_chunks)} chunks)...")
    # batch_size 2 is the setting the 4096-token windows were timed with (190 posts in 119 s on MPS)
    chunk_vectors = model.encode(all_chunks, batch_size=2, normalize_embeddings=True)

    embeddings = []
    for start, token_lens in spans:
        vectors = chunk_vectors[start:start + len(token_lens)]
        if len(vectors) == 1:
            embeddings.append(np.array(vectors[0]))
        else:
            embeddings.append(_pool_chunk_embeddings(vectors, token_lens))
    print(f"Got {len(embeddings)} embeddings, dim={len(embeddings[0])}")
    return np.array(embeddings)


def embed_input_hash(post):
    """Fingerprint of exactly what the model would embed for this post.

    It covers the model and every chunk, so an edited post, a new chunking
    rule and a new model all change it, while an unchanged post never does.
    """
    payload = json.dumps([EMBED_MODEL, post["embed_chunks"]], ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load_json_dict(path, what):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return data
    except (json.JSONDecodeError, ValueError):
        print(f"Warning: corrupt {what}, starting fresh")
        return {}


def _save_json(path, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def load_cached_embeddings():
    """Load cached embeddings as {slug: [float, ...]}."""
    return _load_json_dict(EMBEDDINGS_PATH, "embeddings cache")


def save_cached_embeddings(embeddings_dict):
    """Save embeddings cache."""
    _save_json(EMBEDDINGS_PATH, embeddings_dict)


def load_embedding_hashes():
    """Load {slug: embed_input_hash} for the text each cached vector came from."""
    return _load_json_dict(EMBEDDING_HASHES_PATH, "embedding hashes")


def save_embedding_hashes(hashes):
    _save_json(EMBEDDING_HASHES_PATH, hashes)


def normalize_coords(coords):
    """Normalize coordinates to [0, 1] range."""
    for i in range(2):
        col = coords[:, i]
        col_range = col.max() - col.min()
        if col_range > 0:
            coords[:, i] = (col - col.min()) / col_range
    return coords


def main():
    # Two builds in one checkout would interleave their writes, and one could
    # leave its hash beside the other's vector. A second build waits here
    # until the first finishes, then reads the files the first one wrote.
    # lazy: fcntl is POSIX-only (macOS, Linux CI); use a lock-file package if
    # this ever has to run on Windows.
    os.makedirs(DATA_DIR, exist_ok=True)
    data_dir = os.open(DATA_DIR, os.O_RDONLY)
    try:
        fcntl.flock(data_dir, fcntl.LOCK_EX)
        _build()
    finally:
        os.close(data_dir)  # closing the descriptor releases the lock


def _build():
    posts = load_posts()
    print(f"Loaded {len(posts)} posts")

    # Load cached embeddings to avoid embedding unchanged posts again
    cached_embeddings = load_cached_embeddings()
    embedding_hashes = load_embedding_hashes()
    current_hashes = {p["slug"]: embed_input_hash(p) for p in posts}

    # Reuse a cached vector only when it was made from the exact input the
    # post would send now. The slug alone cannot tell: an edited post, or a
    # long post chunked under an older rule, keeps its slug but not its text.
    def _is_stale(post):
        slug = post["slug"]
        return slug not in cached_embeddings or embedding_hashes.get(slug) != current_hashes[slug]

    new_slugs = [p["slug"] for p in posts if _is_stale(p)]
    cached_slugs = [p["slug"] for p in posts if not _is_stale(p)]

    print(f"Cached: {len(cached_slugs)}, New or changed: {len(new_slugs)}")

    # Embed only new posts
    if new_slugs:
        new_posts = [p for p in posts if p["slug"] in set(new_slugs)]
        new_emb = get_embeddings(new_posts, load_model())
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
    # The two files are written one after the other, so a crash between them
    # must not leave a new vector beside an old hash: that old hash would match
    # again if the post were reverted, and the edited vector would be reused.
    # Drop the hashes of re-embedded posts first; until the final write they
    # have none, so any failure makes the next run embed them again.
    save_embedding_hashes({s: h for s, h in embedding_hashes.items() if s not in set(new_slugs)})
    save_cached_embeddings(cached_embeddings)
    save_embedding_hashes(current_hashes)

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
