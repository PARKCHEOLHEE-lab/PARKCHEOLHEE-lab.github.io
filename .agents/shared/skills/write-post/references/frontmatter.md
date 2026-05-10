# Frontmatter Templates

This repo's posts use YAML frontmatter at the top of every `.html` file, between `---` delimiters. The fields differ by category.

## `note/_posts/` — short concept / essay / focused technical note

### Minimum (always required)

```yaml
---
title: "<Title>"
layout: post
related: []
---
```

### Optional fields

| Field | When | Example |
|---|---|---|
| `emoji` | Only for essay / observation / reflective posts | `emoji: /emoji/eyes.png` |

The `emoji` field maps to a label on the latent-space visualization. **Only the seven files in the table below have label mappings** — the latent-space mapper (`.agents/shared/skills/build-latentspace/scripts/build_post_map.py`'s `EMOJI_TO_LABEL`) recognises exactly these. Setting any other filename (even ones present under `emoji/` like `bulb.png`, `pencil.png`, `dna.png`, `clip.png`, `fire.png`, `wordballoon.png`) silently falls back to the "Note" label, which is almost never what you want.

| File | Label | Used for |
|---|---|---|
| `brain.png` | Brain | ML / theory deep-dive |
| `books.png` | Books | Book quotes, reading reflections |
| `pin.png` | Pin | Reading list, bookmarked references |
| `eyes.png` | Eyes | Observation / commentary on industry / ego |
| `wordballoon-with-dots.png` | Wordballoon | Quiet thought, philosophical posts |
| `robot.png` | Robot | AI behavior, agents, automation |
| `storm.png` | Storm | Strong-opinion essays |

**Do not invent new emoji names.** If none fits, omit the field — it falls back to the "Note" label deliberately. To add a new emoji, register it in `EMOJI_TO_LABEL` first (and update this table).

### Examples

`note/_posts/2026-04-25-window-crossing-selection.html` — technical note, no emoji:
```yaml
---
title: "Window/Crossing Selection"
layout: post
related: []
---
```

`note/_posts/2026-02-05-ego.html` — reflective essay, emoji set:
```yaml
---
title: "ego"
layout: post
emoji: /emoji/eyes.png
related: []
---
```

`note/_posts/2026-04-17-limits-of-language.html` — Korean keyword post:
```yaml
---
title: "언어의 한계"
layout: post
emoji: /emoji/wordballoon-with-dots.png
related: []
---
```

## `testbed/_posts/` — long-form experiment / project writeup

### Scaffold-time template (no venue, no thumbnail yet)

```yaml
---
title: "<Title>"
layout: post
hashtag: "#tag1 #tag2 #tag3"
comment: true
splitter: 2
featured: false
inprogress: false
related: []
---
```

The scaffolder writes this minimal shape on purpose — neither `at:` nor `thumbnail:` is included. Both fields are rendered through Liquid `{% if … %}` blocks that treat any string (including `""`) as truthy, so emitting them with placeholder values causes broken markup on the testbed index.

### With a venue

If the project was done at a specific lab or event, add an `at:` line. **Do not use an empty string** — Liquid treats `""` as truthy, so `_includes/testbed.html` and `_includes/meta.html` would render a dangling `＠` marker. Either include a real venue or omit the field entirely.

```yaml
at: "Visual Media Lab"
```

### With a thumbnail

Add `thumbnail:` only after the PNG exists on disk. `_includes/testbed.html:57` renders `<img src="{{ post.thumbnail }}">` whenever the field is truthy, so a non-existent path becomes a broken image card on the testbed index. Convention: `/img/<slug>/<slug>-thumbnail.png`.

```yaml
thumbnail: /img/<slug>/<slug>-thumbnail.png
```

| Field | Notes |
|---|---|
| `hashtag` | Three to five short tags, prefixed with `#`, space-separated, all wrapped in a single quoted string. |
| `comment` | Almost always `true`. |
| `splitter` | Almost always `2`. Controls layout column split. |
| `featured` | `true` puts the post in the featured slot on the landing page. Default `false`. |
| `inprogress` | `true` while still drafting. Set `false` when the post is shippable. The scaffolder writes `false` so the post is shippable as soon as the body is ready; flip to `true` if you want it tagged as a draft. |
| `at` | Lab / event / venue name (e.g. `Visual Media Lab`, `Spacewalk`). **Omit the line entirely if there is no venue.** Two `at:` values have dedicated link templates in `_includes/meta.html` (`Spacewalk`, `Visual Media Lab`); other values render as plain text. |
| `thumbnail` | Path to a card-sized thumbnail PNG that already exists on disk. **Omit the line entirely until the file is generated**, otherwise `_includes/testbed.html:57` renders a broken `<img>`. Generate the thumbnail after the body is written and add this line then (or rerun the scaffolder with `--thumbnail`). |

### Example

`testbed/_posts/2026-02-03-image-to-3d-scene.html`:
```yaml
---
title: "Image to 3D Scene Pipeline"
layout: post
hashtag: "#sam #sam-3d-objects #generative-design"
comment: true
splitter: 2
featured: false
inprogress: false
at: Visual Media Lab
thumbnail: /img/image-to-3d-scene/image-to-3d-scene-thumbnail.png
related: []
---
```

## What never goes in frontmatter

- `date:` — the date is in the filename. Do not duplicate.
- `tags:` (Jekyll's default tags taxonomy) — this repo uses `hashtag` for testbed instead.
- `categories:` — the category is implicit from `note/_posts/` vs `testbed/_posts/`.
- `permalink:` — Jekyll derives it from the slug.
- `author:` — single-author blog, configured at the site level.

## `related: []` is the contract

The skill **must** leave `related:` empty. The `/add-related` skill is the single source of truth for related-slug computation. Writing slugs into `related:` from `write-post` violates the contract and the user has explicitly instructed against it.
