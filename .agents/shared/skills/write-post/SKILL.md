---
name: write-post
description: Scaffold and draft a new blog post under note/_posts or testbed/_posts following this repo's frontmatter, body-style, image, and follow-up conventions. Use when the user asks to write a post, draft a post, or expand a topic into a post.
argument-hint: "[topic] [--language=en|kr] [--emoji=<file>] [--sources=<urls,paths>] [--category=note|testbed] [--slug=<slug>] [--at=<venue>] [--thumbnail=<path>]"
user-invocable: true
allowed-tools: "Read Write Edit Bash Glob Grep WebFetch"
---

# Write Post

Draft a new blog post for `PARKCHEOLHEE-lab.github.io` end-to-end: confirm category and slug, scaffold the file, ingest sources, write the body in the correct style, generate diagrams when needed, verify the Jekyll build, and hand off to `/add-related`.

## Arguments

Parse the slash-command `ARGUMENTS:` line for the following flags. All optional.

| Flag | Values | Default | Meaning |
|---|---|---|---|
| `--language` | `en` / `kr` | `en` | Body language. `en` = English, `kr` = Korean. |
| `--emoji` | One of `brain.png`, `books.png`, `pin.png`, `eyes.png`, `wordballoon-with-dots.png`, `robot.png`, `storm.png` (or the same with `/emoji/` prefix) | _(none)_ | Sets the `emoji:` frontmatter field. **Only the seven emojis listed have label mappings in `build-latentspace`** — others silently fall back to "Note". If none fits, omit the flag. Full table: `references/frontmatter.md`. |
| `--sources` | comma-separated list of URLs and/or local file paths | _(none)_ | Reference material. URLs are fetched via `WebFetch`; local paths are read with `Read`. |
| `--category` | `note` / `testbed` | _(ask)_ | Skip if not provided — always confirm with `AskUserQuestion`. |
| `--slug` | kebab-case slug | _(derive + confirm)_ | Filename slug without date prefix or extension. |
| `--at` | venue / lab / event string (testbed only) | _(none)_ | **Do not pass an empty string.** Liquid treats `""` as truthy and renders a dangling `＠` marker in the testbed index. Omit the flag if there is no venue. Known special-cased values with link templates: `Visual Media Lab`, `Spacewalk`. |
| `--thumbnail` | thumbnail path, e.g. `/img/<slug>/<slug>-thumbnail.png` (testbed only) | _(none)_ | **Pass only after the file actually exists.** `_includes/testbed.html` renders `<img src="…">` whenever the field is set, so a non-existent path becomes a broken image card on the testbed index. Omit the flag at scaffold time, generate the PNG in Step 8, and either rerun the scaffolder or add the line manually. |

A free-text topic (anything in `ARGUMENTS:` outside the flags) is treated as the topic seed.

## Hard rules (do not violate)

1. **Do not infer or write `related:` slugs.** The `related:` field is delegated to the `/add-related` skill. Leave it as an empty list (`related: []`) or omit the field entirely. After the post is written, instruct the user to run `/add-related --post-name=<slug>`.
2. **Do not write SVG by hand.** All diagrams must be produced by validated math libraries: `matplotlib` for 2D, `three.js` + headless Chromium for 3D, `numpy` for numerical work. Hand-coded SVG paths are forbidden because they tend to be geometrically wrong.
3. **`<figure>` tags must not sit inside `<li>` tags.** Place figures as siblings of the surrounding `<ul>`/`<ol>`, never as children of a list item. Compare to `note/_posts/2023-08-23-normalization-layers.html` for the canonical pattern.
4. **No matplotlib spines on diagrams.** Always call `for s in ax.spines.values(): s.set_visible(False)` before saving — the user has explicitly rejected bordered figures.
5. **Block math (`\[ ... \]`) must be wrapped in `<div class="latex-container">...</div>`.** Inline math (`\( ... \)`) does not need a wrapper. Reference: `note/_posts/2024-04-18-mathematics-for-machine-learning.html`.
6. **Image paths follow `img/<slug>/<slug>-N.{png,jpg}`.** Single-image posts may use `img/<slug>/<slug>.png`. Always create the `img/<slug>/` directory before writing files.
7. **Do not edit the generated `_site/` directory.** Source files only — Jekyll regenerates `_site/` on build.

## Workflow

### Step 1 — Resolve repo paths

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILL_DIR="${CLAUDE_SKILL_DIR:-$REPO_ROOT/.agents/shared/skills/write-post}"
cd "$REPO_ROOT"
```

### Step 2 — Ingest sources (if `--sources` provided)

For each entry in `--sources`:
- Starts with `http://` or `https://` → `WebFetch` the URL with a prompt asking for the load-bearing facts, code snippets, and quotable lines.
- Otherwise → treat as a local path and use `Read`.

Keep the digested material in working memory. Do **not** quote sources verbatim in the body — the user prefers paraphrased explanations with sources cited at the end.

### Step 3 — Confirm category

Always run `AskUserQuestion`:

- **note** — single concept, observation, short essay, or focused technical note. Examples: `window-crossing-selection`, `ego`, `limits-of-language`, `regression-model`.
- **testbed** — long-form experiment / project writeup with profiling, multiple sections, and paper citations. Examples: `image-to-3d-scene`, `latent-shapes`, `office-layout-generation-agents`.

Do not auto-decide. The user has answered "always ask" for this checkpoint.

### Step 4 — Derive and confirm the slug

Generate a kebab-case slug from the topic. Lowercase, ASCII, hyphen-separated, no stopwords like "the"/"a" unless meaningful. Confirm with `AskUserQuestion` before proceeding.

The filename is `YYYY-MM-DD-<slug>.html` where the date is today (or whatever the user asks for). Run:

```bash
DATE="$(date +%F)"
FILE="$REPO_ROOT/<note|testbed>/_posts/${DATE}-${SLUG}.html"
```

Abort if `$FILE` already exists — ask the user how to proceed.

### Step 5 — Pick a body style

Pick from four templates (full HTML wrappers in `references/body-styles.md`). The `--style` value passed to `scripts/new_post.py` must be one of these exact tokens.

| Style | When to pick | Wrapper |
|---|---|---|
| `outline` | `note` posts that explain structure or mechanism | nested `<ul><li>...</li><ul><li>...</li>...</ul></ul>` |
| `prose` | `note` short essay, observation, prose-style technical intuition | `<div style="text-align: justify;">...<br><br>...</div>` |
| `keyword` | `note` Korean thought-jump posts (one short line per keyword/phrase) | `<div style="text-align: justify;">line<br>line<br>...</div>` |
| `testbed-longform` | All `testbed` posts — long-form experiment / project writeups | `<div id="toc"></div>` + repeated `<h3>Title</h3><div class="article">…</div><br><br>` blocks |

Category → style hard rules:
- `--category=testbed` → **must** use `testbed-longform`. The other three styles are `note` wrappers and produce the wrong HTML structure for testbed posts. See `testbed/_posts/2026-02-03-image-to-3d-scene.html` for the canonical shape.
- `--category=note` → pick one of `outline`, `prose`, `keyword`. `testbed-longform` is forbidden inside `note/_posts`.

Inference cues for `note`:
- `--language=kr` + topic is reflective/philosophical → likely `keyword` or `prose`
- `--language=en` + topic involves code, math, or system mechanics → likely `outline`

Confirm the chosen style with `AskUserQuestion` before writing.

### Step 6 — Scaffold the file

Use `scripts/new_post.py` to create the file with the frontmatter pre-filled and body wrapper ready:

```bash
python3 "$SKILL_DIR/scripts/new_post.py" \
  --category "${CATEGORY}" \
  --slug "${SLUG}" \
  --title "${TITLE}" \
  --style "${STYLE}" \
  ${EMOJI:+--emoji "$EMOJI"} \
  ${LANGUAGE:+--language "$LANGUAGE"} \
  ${AT:+--at "$AT"} \
  ${THUMBNAIL:+--thumbnail "$THUMBNAIL"}
```

`--at` and `--thumbnail` only apply to `--category=testbed` and **only** when the value is real. If the user did not provide one, do not synthesise an empty string — the script omits the field entirely, which is the only safe behaviour given Liquid's truthiness rules. For `--thumbnail`, do not pass a path that does not yet exist on disk: the testbed index template renders an `<img>` tag whenever the field is set, so a non-existent path becomes a broken image card.

Thumbnail follow-up: after the body is written and you produce the post's hero diagram in Step 8, also generate a card-sized thumbnail (square or 16:9) and save it to `img/<slug>/<slug>-thumbnail.png`. Then either re-run the scaffolder with `--thumbnail`, or insert the line `thumbnail: /img/<slug>/<slug>-thumbnail.png` into the frontmatter manually.

The script writes `<category>/_posts/<date>-<slug>.html` and prints the path. It also creates `img/<slug>/` ahead of any diagram work.

Frontmatter rules:
- `title:` — quoted. `--language=kr` → Korean title; `--language=en` → English title.
- `layout: post` — always.
- `emoji:` — only if `--emoji` was provided.
- `related: []` — empty list. **Do not populate.** Reserved for `/add-related`.
- `testbed` adds: `hashtag`, `comment: true`, `splitter: 2`, `featured: false`, `inprogress: false`. The `at:` and `thumbnail:` lines are **only** added when real values are provided via `--at` and `--thumbnail`. Liquid treats both fields with truthy empty-string semantics in `_includes/testbed.html` and `_includes/meta.html`, so an empty `at: ""` would render a dangling `＠` marker and an empty (or non-existent) `thumbnail:` would render a broken `<img>` on the testbed index. The conventional thumbnail path is `/img/<slug>/<slug>-thumbnail.png`; pass it via `--thumbnail` only after the PNG actually exists.

Full templates: `references/frontmatter.md`.

### Step 7 — Write the body in one shot

Using the digested sources and the chosen style, write the **entire** body in one pass. Do not propose multiple candidates upfront — the user has chosen "write the full draft, then iterate on revisions."

Style-specific guidance: `references/body-styles.md`.

Tone:
- **English (`en`)**: plain, direct, no first-person, sentence-case headings, prefer the active voice.
- **Korean (`kr`)**: keep one register per post (do not mix `~다` and `~합니다`). Short sentences. `<br>`-separated thought-jumps for the keyword style.

Sources are paraphrased into the body. End the post with a `Sources:` section if external references were used:

```html
<br><br>
Sources:
<ul>
    <li><a href="https://...">Title</a></li>
</ul>
```

For posts that cite a single LinkedIn / Tweet / external author, use the inline pattern instead:

```html
<br><br>
Author Name's <a href="https://...">LinkedIn Post</a>
```

End every post with `<br><br>` (two trailing breaks).

### Step 8 — Generate diagrams (only if needed)

If the post benefits from a figure, generate it. Prefer:
- **2D, geometry / math / data** → `matplotlib` (turn off all spines, no titles unless load-bearing, color-code consistently)
- **3D, geometry / projection / cameras** → `three.js` rendered through headless Chromium (canonical pattern: see `references/images.md`)
- **Networks / DAGs** → `matplotlib` + `networkx` or `graphviz`

Save to `img/<slug>/<slug>-N.png` (N=0,1,2,…). Embed with:

```html
<figure>
    <img src="/img/<slug>/<slug>-0.png" width="100%" onerror=handle_image_error(this)>
    <figcaption>Optional caption</figcaption>
</figure>
```

Never put `<figure>` inside `<li>`. Never hand-write SVG.

If the math says a diagram should compare against a canonical reference (e.g., perspective projection vs Scratchapixel, line–line intersection vs Wikipedia), the user typically asks for that comparison after the first diagram. Be ready to fetch canonical references and verify visually.

### Step 9 — Verify the build

`bundle exec jekyll build | tail -30` would mask Jekyll failures because the pipeline exit status is `tail`'s, not Jekyll's. Capture the log to a file and check Jekyll's own exit status:

```bash
bundle exec jekyll build >/tmp/jekyll-build.log 2>&1
status=$?
tail -30 /tmp/jekyll-build.log
[ "$status" = "0" ] || { echo "BUILD FAILED (exit $status)"; exit "$status"; }
```

If Jekyll fails, read the captured log, fix the source, and re-run. If it succeeds and the user has the dev server running, suggest visiting `http://127.0.0.1:4000/<slug>/`.

### Step 10 — Hand off to `/add-related`

After the body is written and the build is green, tell the user:

```
Post written: <category>/_posts/<date>-<slug>.html
Run `/add-related --post-name=<slug>` to populate the related: field.
build-latentspace will run automatically when this post is merged to main.
```

Do **not** run `/add-related` automatically — the user invokes it explicitly.

## What this skill does NOT do

- Does not populate the `related:` frontmatter field. That is `/add-related`'s job.
- Does not run `build-latentspace`. It triggers automatically on merge.
- Does not create the PR. The user creates the PR when they are satisfied.
- Does not commit. The user commits when ready.
- Does not modify existing posts (other than adding figures requested via follow-up). For diagram or content updates to an existing post, treat it as a separate request.

## References

- `references/frontmatter.md` — full frontmatter templates per category.
- `references/body-styles.md` — outline / prose / keyword wrappers and code/math conventions.
- `references/images.md` — diagram production with matplotlib / three.js + headless Chromium.
- `references/examples.md` — slug → category, style, language mapping for representative posts.
