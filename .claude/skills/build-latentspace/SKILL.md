---
name: build-latentspace
description: Rebuild the D3.js post map by embedding all blog posts with OpenAI and reducing to 2D with UMAP. Run when posts are added, removed, or labels need refreshing.
user-invocable: true
allowed-tools: "Bash Read"
---

# Build Latent Space

Rebuild `assets/data/latentspace.json` — the single data source for the D3.js latent space visualization on the landing page.

## What it does

1. Collects all eligible posts from `note/_posts` and `testbed/_posts` (excludes `_` prefixed files)
2. Embeds each post using OpenAI `text-embedding-3-small`
3. Reduces embeddings to 2D with UMAP
4. Assigns a label based on `emoji` frontmatter
5. Extracts `connected` links from `related` frontmatter
6. Writes the result to `assets/data/latentspace.json`

## Prerequisites

- `OPENAI_API_KEY` environment variable must be set
- Python dependencies: `openai`, `umap-learn`, `numpy`, `beautifulsoup4`, `lxml`

## Run

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/build_post_map.py"
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
