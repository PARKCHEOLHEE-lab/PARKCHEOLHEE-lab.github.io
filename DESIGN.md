# Design System — PARKCHEOLHEE-lab.github.io

This is the rule book for any visual change to this Jekyll blog. Read it before
touching `_sass/`, `_layouts/`, `_includes/`, post HTML, or `assets/css/`.
Token discipline is enforced by **convention and review**, not by a linter —
this repo uses Sass with Jekyll, and the JS-ecosystem stylelint flow does not
apply. The agent (Claude / Codex) is the enforcer.

## Single source of truth

All design tokens live in `_sass/index.sass` as Sass variables.
`assets/css/index.sass` imports them first, so every other partial
(`basic`, `layout`, `classes`, `latentspace`) sees them.

When introducing a new color, spacing, or font value, add a Sass variable
to `_sass/index.sass` and reference it from the partial. Do not write a raw
hex literal in any partial except the two excluded zones below.

## Tokens

### Type

| Token | Value | Use |
|---|---|---|
| `$font-family` | `"PT Sans", -apple-system, ...` | All body and headings |
| `$font-size` | `calc(0.7rem + 0.2vw)` | Fluid base body size |
| `$font-weight` | `400` | Body |
| `$heading-weight` | `600` | h1–h6 |
| `$line-height` | `1.6` | Body |

Smaller utility sizes are written inline as `calc(0.6rem + 0.2vw)` /
`calc(0.45rem + 0.2vw)` / `calc(0.35rem + 0.2vw)`. These follow the same
fluid pattern (rem floor + 0.2vw scaling). When adding a new size, keep the
same shape; do not introduce a non-fluid `px`-only size.

### Color

| Token | Value | Use |
|---|---|---|
| `$dark` | `#000000` | Body text on light surfaces |
| `$light` | `#ffffff` | Page background |
| `$text-dark` | `rgb(70, 70, 70)` | Strong / table heading text, post titles |
| `$link-color` | `#66a1ff` | Standard `<a>` link |
| `$featured-color` | `#0011e3` | Featured underline (`u.wavy-underline`), pinned title bg |
| `$inprogress-color` | `#1aff00` | WIP underline |
| `$bg-subtle` | `#f7f7f8` | Chat bubble + code block background |
| `$text-chat` | `#343541` | Chat-style body text |
| `$divider` | `#e5e5e6` | Horizontal rule, hairline divider |
| `$link-chat` | `#4b83ec` | Link inside chat bubbles |

For tinted overlays (borders, hover states, disabled text) use the existing
`reduce($percent)` function — it returns `rgba(mix($dark, $light), $percent / 100)`,
so the same percentage gives a consistent tint across the site.

### Spacing

The repo uses an **em-based rhythm**, not a fixed pixel grid. Common steps:
`0.2em`, `0.4em`, `0.5em`, `1em`, `1.5em`, `2em`. Pick the existing step
nearest to what you need; do not invent intermediate values like `0.7em`
unless there is a clear reason. Body padding scales by viewport via
`calc(20vw - 6em)` (mid) and `calc(40vw - 17em)` (wide).

### Breakpoints

Two breakpoints, both in `em`:

- `min-width: 40em` — tablet+
- `min-width: 64em` — desktop+

Defined in `assets/css/index.sass`. Do not introduce a third breakpoint
without a concrete reason; the layout is content-width driven, not
device-class driven.

## Excluded zones (intentional raw values)

Two **scopes** are exempt from the "no raw hex" rule. The exemption is
scope-bound, not file-bound — same-file rules outside the scope must
still use tokens:

1. **`_sass/classes.sass` `.highlight { ... }` block (lines ~59–155)** —
   Pygments / Rouge syntax-highlighting palette. The hex values
   (`#f8f8f2`, `#f92672`, `#ae81ff`, `#a6e22e`, `#e6db74`, `#66d9ef`,
   `#75715e`, ...) are the Monokai theme. They are a fixed external
   palette, not design choices, and should not be renamed. Rules
   *outside* `.highlight` in the same file (`.title`, `.more`,
   `.archive`, `.icon`, `.katex`, `.rouge-table`) are general utilities
   and DO follow token discipline.

2. **`_sass/latentspace.sass`** — D3 categorical color palette for the
   latent-space post map. Each color encodes a post category and is read
   by `js/latentspace.js`. Renaming or unifying these would silently
   change the visualization.

If you find yourself wanting to add a third excluded zone, that is a sign
the new feature should be a token instead.

## Anti-patterns (don't do these)

- **No drop shadows on cards or surface containers.** The site uses
  `border` + `reduce(N)` tints, not shadows. Adding
  `box-shadow: 0 4px 12px rgba(0,0,0,0.1)` to a card / panel / hero block
  makes the page look like a generic SaaS landing.
  Sanctioned exception: **`<img class="book-cover">`** for subject-matter
  image displays (book covers, album art, posters where the image *is*
  the content). Defined in `_sass/basic.sass`. Do not invent additional
  per-image shadow utilities without adding them here first.
- **No decorative gradients.** Backgrounds are flat. Featured emphasis uses
  `$featured-color` as a solid block (`.title-main`) or wavy underline,
  never as a gradient sweep.
- **No icon emoji libraries.** The site already uses purpose-built emoji
  assets under `emoji/` for post labels. Do not import Font Awesome
  *icons*, Heroicons, or Lucide for decorative purposes. (Font Awesome
  *fonts* under `assets/fontawesome/` are kept for legacy posts that
  reference them; do not extend their use.)
- **No new font families.** PT Sans + system fallbacks only. KaTeX comes
  with its own fonts and is the only exception.
- **No hardcoded `px` for body or section spacing.** Use `em` so spacing
  scales with the fluid base font size. The chat-bubble component is the
  one tolerated exception (it uses `10px` / `15px` to lock bubble shape).

## What this project does NOT use

- **Tailwind / utility-first CSS.** All styles are Sass partials.
- **A dark theme.** The `prefers-color-scheme: dark` media query in
  `_sass/basic.sass` deliberately keeps the body light. Do not add dark
  variants unless the user asks.
- **Stylelint or a token-rejection linter.** Sass+Jekyll has no equivalent
  to the JS-ecosystem `stylelint-declaration-strict-value` flow. Token
  discipline is convention-only; the agent and the reviewer enforce it.
- **A component library.** Every UI piece is a Sass class + Jekyll include.

## Migration backlog (raw hex still present)

Two rows remain unmigrated by design. Each needs a per-case decision
before it can be folded into the token system:

| File | Line | Raw value | Why deferred |
|---|---|---|---|
| `_sass/basic.sass` | ~130 | `#f6f6f6` (`pre bg`) | One digit off from `$bg-subtle` (`#f7f7f8`). Folding requires a visual check of code blocks across posts; until then, keep separate. |
| `_sass/basic.sass` | ~433 | `#9c9c9c` (`.site-description`) | No matching token yet. Decide whether to introduce `$text-muted` or replace with `reduce(N)` for a single source-of-truth muted gray. |

The previous backlog (chat-message bubbles, `hr`, blockquote, `.title-main`
color, `.message-content` content) was migrated in the same pass that
created this document. Future raw-hex additions should fail review.

## Math display overflow

Display-math equations rendered by KaTeX (`.katex-display`) and
MathJax v2 CHTML (`.mjx-chtml.MJXc-display`) become their own
horizontal scroll boundary via a universal rule in `_sass/basic.sass`.
This means **wide equations scroll inside the equation block on
mobile**; you do not need to wrap each `\[ ... \]` in a
`<div class="latex-container">`.

The legacy `.latex-container` utility (`overflow: auto` on a wrapper
div) still exists and is harmless when used. Going forward, prefer
the implicit universal rule — leaving math markup unwrapped is the
correct convention. Existing wrapper divs in older posts are
load-bearing-but-redundant; do not remove them in a sweep.

Note: the rule targets the parent display container, not the inner
`.mjx-full-width` span. MathJax v2 sets `max-width: none` directly
on `.mjx-full-width`, so any rule on that selector gets overridden.
The parent `.mjx-chtml.MJXc-display` is the reliable scroll boundary.

## Verification

After any Sass change:

```bash
bundle exec jekyll build
```

If the build succeeds, the Sass compiles. Visual regressions still need
a `bundle exec jekyll serve` + browser check — there is no automated
visual diff in this repo.
