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

The `emoji` field maps to a label on the latent-space visualization. Available files (under `emoji/`):

| File | Used for |
|---|---|
| `brain.png` | ML / theory deep-dive |
| `books.png` | Book quotes, reading reflections |
| `pin.png` | Reading list, bookmarked references |
| `eyes.png` | Observation / commentary on industry / ego |
| `wordballoon-with-dots.png` | Quiet thought, philosophical posts |
| `robot.png` | AI behavior, agents, automation |
| `storm.png` | Strong-opinion essays |
| `bulb.png` | Insight / quick aha posts |
| `pencil.png` | Writing / drafting / process posts |
| `dna.png` | Identity / formation / origin posts |
| `clip.png` | Cheat sheets / clipped-fact posts |
| `fire.png` | Urgency / breakthrough |

**Do not invent new emoji names.** If none fits and the topic is reflective, omit the field — it falls back to the "Note" label.

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

### Full template

```yaml
---
title: "<Title>"
layout: post
hashtag: "#tag1 #tag2 #tag3"
comment: true
splitter: 2
featured: false
inprogress: false
at: ""
thumbnail: /img/<slug>/<slug>-thumbnail.png
related: []
---
```

| Field | Notes |
|---|---|
| `hashtag` | Three to five short tags, prefixed with `#`, space-separated, all wrapped in a single quoted string. |
| `comment` | Almost always `true`. |
| `splitter` | Almost always `2`. Controls layout column split. |
| `featured` | `true` puts the post in the featured slot on the landing page. Default `false`. |
| `inprogress` | `true` while still drafting. Set `false` when the post is shippable. |
| `at` | Lab / event / venue name (e.g. `Visual Media Lab`, `KOCCA`). Empty string if none. |
| `thumbnail` | Path to a card-sized thumbnail. Generate after the body is written. |

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
