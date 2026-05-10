# Example Mapping

Representative existing posts mapped to category, language, and style. Use these as reference when classifying a new post.

## note/_posts/

| Slug | Language | Style | Emoji | Why |
|---|---|---|---|---|
| `2026-04-25-window-crossing-selection` | en | outline | _(none)_ | Mechanism explanation with code, math, and 4 diagrams |
| `2026-04-09-triangle-menu-aim` | en | outline | _(none)_ | UX pattern explained with code and one diagram |
| `2026-03-15-regression-model` | en | outline | _(none)_ | Statistical concept with math and an interactive canvas |
| `2026-03-12-wasm` | en | outline | _(none)_ | Tooling note |
| `2026-02-13-intuitions-about-diffusion-models` | en | prose | _(none)_ | Math-prose intuition with one figure |
| `2026-02-05-ego` | kr | prose | `eyes.png` | Reflective essay quoting a LinkedIn post |
| `2026-04-17-limits-of-language` | kr | keyword | `wordballoon-with-dots.png` | Thought-jump on language and AI |
| `2026-03-08-spurting` | kr | prose | `wordballoon-with-dots.png` | Short reflection with one figure |
| `2026-01-03-standardization` | en | outline | _(none)_ | Stat preprocessing concept |
| `2025-09-17-pca` | en | outline | _(none)_ | ML concept deep-dive |
| `2025-08-04-layout-vlm` | en | outline | _(none)_ | Long technical note (~26KB), still note-shaped |
| `2025-07-29-no-longer-human` | kr | prose | `books.png` | Book quote / reflection |
| `2025-06-16-capability-overhang` | en | prose | `eyes.png` | Industry observation |
| `2025-06-09-truth` | en | prose | `wordballoon-with-dots.png` | Philosophy / reflection |

## testbed/_posts/

| Slug | Language | Style | At | Notes |
|---|---|---|---|---|
| `2026-02-03-image-to-3d-scene` | en | testbed long-form | Visual Media Lab | Pipeline writeup with paper citations |
| `2025-08-11-latent-shapes` | en | testbed long-form | _(varies)_ | Generative shape experiment |
| `2025-07-30-office-layout-generation-agents` | en | testbed long-form | _(varies)_ | Multi-agent + GA optimization |
| `2025-04-02-voxels-to-graph` | en | testbed long-form | _(varies)_ | Voxel → graph conversion |
| `2024-12-02-landbook-diffusion-pipeline` | en | testbed long-form | Landbook | Diffusion pipeline writeup |
| `2024-06-07-polygon-segmentation` | en | testbed long-form | _(varies)_ | Algorithmic deep-dive |

## Decision rules

When unsure which category to pick, use these rules of thumb (then confirm with `AskUserQuestion`):

1. **Output of a project / experiment with profiling, multiple sections, paper references** → testbed
2. **Single concept / observation / mechanism explanation** → note
3. **Short reflection or thought-jump in Korean** → note (prose or keyword)
4. **Cheat sheet or reference list** → note (use `pin.png` emoji, or omit emoji to fall back to the "Note" label)
5. **Book or quote-driven essay** → note with `books.png` emoji

Only the seven emojis mapped in `build-latentspace`'s `EMOJI_TO_LABEL` (`brain`, `books`, `pin`, `eyes`, `wordballoon-with-dots`, `robot`, `storm`) produce a non-default latent-space label. Other emoji files exist under `emoji/` but are silently labeled "Note" — see `references/frontmatter.md` for the canonical table.

When unsure which body style to pick:

1. The topic explains a step-by-step mechanism with code and math → outline
2. The topic is a short observation / intuition / quote-and-react → prose
3. Korean, short punchy lines, philosophical → keyword

## Past user feedback to watch for

- "다 구리다" / "더 날카롭게" → prose or keyword first attempt rejected, fall back to "propose 30–50 candidates, let user pick"
- "figure는 li 안에 넣지마" → fix figure placement
- "테두리 없어도 됨" → matplotlib spine removal
- "더 좋은방법 없음? threejs" → swap mock matplotlib 3D for real Three.js render
- "내용 자체를 기준으로" / "이상한소리 말고" → cut the meta-commentary, give substance
- "다이어그램이 적절한지 인터넷과 비교" → fetch canonical refs and compare side-by-side
