# Body Style Templates

Three templates cover the patterns observed in this repo. Pick one before writing.

## 1. Outline (technical notes)

Used for posts that explain a structure, mechanism, or step-by-step thought. Section titles are siblings; details live in nested `<ul>`.

```html
<br>

<ul>
    <li>
        Section Title 1
    </li>
        <ul>
            <li>
                Body sentence 1. <code>identifier</code> in inline code, <b>bold</b> for emphasis.
            </li>
            <li>
                Body sentence 2. Code block:

<pre><code class="typescript">
    function example() {
        return 42;
    }
</code></pre>

                Continued explanation after the code.
            </li>
        </ul>
    <figure>
        <img src="/img/&lt;slug&gt;/&lt;slug&gt;-0.png" width="100%" onerror=handle_image_error(this)>
    </figure>
    <br>
    <li>
        Section Title 2
    </li>
        <ul>
            <li>
                Math inline: \(\beta_0 + \beta_1 X\). Block math:
                <div class="latex-container">
                \[
                    Y_i = \beta_0 + \beta_1 X_i + \epsilon_i, \quad \epsilon_i \sim N(0, \sigma^2)
                \]
                </div>
            </li>
        </ul>
    <br>
</ul>

<br><br>
```

Rules:
- Section titles `<li>` are direct children of the outer `<ul>`.
- Detail bullets live in a nested `<ul>` immediately after each section title.
- `<figure>` is a sibling of the inner `<ul>`, never a child of `<li>`.
- Use `<br>` between sections, not extra `<li>` spacers.
- Code blocks use `<pre><code class="LANG">…</code></pre>`. The `class` matches the language for syntax highlighting (`typescript`, `python`, `bash`, `cpp`, `text`).
- Indentation inside `<pre>` uses 4 spaces.

Reference posts:
- `note/_posts/2026-04-25-window-crossing-selection.html`
- `note/_posts/2026-04-09-triangle-menu-aim.html`
- `note/_posts/2026-03-15-regression-model.html`

## 2. Prose (short essay / observation)

Used for short reflective posts and prose-style technical intuitions. Body sits inside one justified `<div>`.

```html
<br>

<div style="text-align: justify;">
    First paragraph. Plain prose, no headings, no bullet points.

    <br><br>

    Second paragraph. Use <code>code</code> and <b>bold</b> sparingly.

    <figure>
        <img src="/img/&lt;slug&gt;/&lt;slug&gt;-0.png" width="100%" onerror=handle_image_error(this)>
        <figcaption class="nofig">
            Optional caption
        </figcaption>
    </figure>

    <br><br>

    Third paragraph.

</div>


<br><br>
```

Rules:
- Paragraphs are separated by `<br><br>`, not `<p>` tags.
- Inline math with `\(...\)`, block math wrapped in `<div class="latex-container">`.
- Single-author voice; no first-person plural unless quoting a paper.
- Korean prose: pick `~다` or `~합니다` and stick with it. Do not mix.

Reference posts:
- `note/_posts/2026-02-13-intuitions-about-diffusion-models.html`
- `note/_posts/2026-02-05-ego.html` (Korean)
- `note/_posts/2026-03-08-spurting.html` (Korean)

## 3. Keyword (Korean thought-jump)

Used for Korean posts that expand a concept by line-jumping through associations. Each line is short and self-contained; `<br>` separates them.

```html
<br>

<div style="text-align: justify;">

    키워드 1
    <br>
    키워드 2
    <br>
    한 줄짜리 사고 점프
    <br>
    또 다른 점프

</div>

<br><br>
```

Rules:
- One short line per `<br>`.
- No periods at the end of lines (matches `limits-of-language` style).
- Lines should be punchy and self-contained — each readable as a standalone aphorism.
- The user has historically rejected the first attempt and asked for many candidates. If `--language=kr` and the chosen style is `keyword`, the assistant should be ready to fall back to "propose 30–50 candidate lines, let the user pick" if the first draft is rejected.

Reference posts:
- `note/_posts/2026-04-17-limits-of-language.html`
- `note/_posts/_words.html` (disabled but stylistically the same)

## Testbed long-form

Long technical writeups in `testbed/_posts/` use a different wrapper: top-level `<h3>` headings, each section in its own `<div class="article">`.

```html
<div id="toc"></div>

<h3>Introduction</h3>
<div class="article">
    Lead paragraph framing the project, funding, and goal.
</div><br><br>

<h3>Section Title</h3>
<div class="article">
    Body, code, math, figures.

    <figure style="display: flex;">
        <img src="/img/&lt;slug&gt;/&lt;slug&gt;-0.png" width="45%" onerror=handle_image_error(this)>
        <img src="/img/&lt;slug&gt;/&lt;slug&gt;-1.png" width="45%" onerror=handle_image_error(this)>
    </figure>
    <figcaption>Side-by-side caption</figcaption>

<pre><code class="python">
import torch
</code></pre>

</div><br><br>
```

Rules:
- Begin with `<div id="toc"></div>` for the table-of-contents widget.
- Each section: `<h3>Title</h3>` then `<div class="article">…</div><br><br>`.
- Multi-image figures use `style="display: flex;"` with `width` per image.
- Long quoted blocks from papers can be HTML-commented out (`<!-- … -->`) if the paraphrase replaces them — keep the original for reference but don't render.

Reference post:
- `testbed/_posts/2026-02-03-image-to-3d-scene.html`

## Code blocks

Always use `<pre><code class="LANG">…</code></pre>`. Common language tags in this repo:

| Tag | Used for |
|---|---|
| `typescript` | Front-end / Three.js / web code |
| `python` | ML, scripts, PyTorch |
| `bash` | Shell snippets |
| `cpp` | Performance-sensitive code |
| `glsl` | Shader code |
| `text` | Generic / log output |

Indent code with 4 spaces. Keep snippets short — quote the load-bearing 5–20 lines, not entire files. If a snippet references a specific file, mention `<path>:<line>` in the surrounding prose (e.g. `threeView.ts:409`).

## Math

| Form | Markup |
|---|---|
| Inline | `\(\beta_0 + \beta_1 X\)` |
| Block | `<div class="latex-container">\[ Y_i = \beta_0 + \beta_1 X_i + \epsilon_i \]</div>` |

Multiple block-math expressions in one section each get their own `<div class="latex-container">`.

## Closing

Every post ends with `<br><br>` (two trailing breaks) before the closing of the file. If a `Sources:` or attribution section exists, it goes **before** the trailing `<br><br>`:

```html
<br><br>
Sources:
<ul>
    <li><a href="https://...">Title</a></li>
</ul>

<br><br>
```
