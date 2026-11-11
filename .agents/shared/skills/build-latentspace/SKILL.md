---
name: build-latentspace
description: Rebuild the D3.js post map by embedding all blog posts locally with Qwen3-Embedding-0.6B and reducing to 2D with deterministic PCA. Run when posts are added, removed, or labels need refreshing.
user-invocable: true
allowed-tools: "Bash Read"
---

# Build Latent Space

Rebuild `assets/data/latentspace.json` — the single data source for the D3.js latent space visualization on the landing page.

## What it does

1. Collects all eligible posts from `_posts/` (excludes `_` prefixed files and empty posts); a post's category is `testbed` when its `categories` front matter says so, otherwise `note`
2. Embeds each post on this machine with `Qwen/Qwen3-Embedding-0.6B` (sentence-transformers; the Mac GPU through MPS when available, else the CPU). A post longer than 4096 tokens is cut into windows whose vectors are pooled into one
3. Reduces embeddings to 2D with deterministic PCA
4. Assigns a label based on `emoji` frontmatter
5. Extracts `connected` links from `related` frontmatter
6. Writes the result to `assets/data/latentspace.json`

Incremental mode: `assets/data/embeddings.json` caches each post's vector, and a post is embedded again only when the text it would embed changes: `assets/data/embedding-hashes.json` stores a hash of the exact input (model and chunks) each cached vector came from, so a run with no changed post never loads the model. Coordinates are recomputed from the full embedding matrix with deterministic PCA.

The build runs locally, not in GitHub Actions (CI runs only the tests). After a run, commit the three files in `assets/data/` with the post change.

## Prerequisites

- Python dependencies: `sentence-transformers` (brings `torch` and `transformers`), `beautifulsoup4`, `lxml`, `numpy`, `scikit-learn`. Install them in the venv the pre-commit hook uses: `~/.venvs/latentspace`, or the one `LATENTSPACE_PYTHON` names
- The first run downloads the model (about 1.1 GB) into the Hugging Face cache; later runs reuse it. Each run also loads the model's tokenizer files to cut the windows

## Run

```bash
SKILL_DIR="${CLAUDE_SKILL_DIR:-$(git rev-parse --show-toplevel)/.agents/shared/skills/build-latentspace}"
"${LATENTSPACE_PYTHON:-$HOME/.venvs/latentspace/bin/python}" "${SKILL_DIR}/scripts/build_post_map.py"
```

Verify the output looks correct:

```bash
python3 -c "import json; data=json.load(open('assets/data/latentspace.json')); print(f'{len(data)} posts'); print({d['label'] for d in data}); print(f'{sum(len(d[\"connected\"]) for d in data)} connections')"
```

## Output schema

```json
{
  "title": "GAN",
  "slug": "gan",
  "url": "/gan/",
  "category": "note",
  "label": "Brain",
  "connected": ["conditional-gan", "building-gan"],
  "x": 0.3421,
  "y": 0.7812
}
```

## Label mapping

Labels are derived from the `emoji` frontmatter field of each post:

| Emoji file | Label |
|---|---|
| brain.png | Brain |
| books.png | Books |
| pin.png | Pin |
| eyes.png | Eyes |
| wordballoon-with-dots.png | Wordballoon |
| robot.png | Robot |
| storm.png | Storm |
| _(testbed posts)_ | Testbed |
| _(no emoji)_ | Note |
