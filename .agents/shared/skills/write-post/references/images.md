# Images and Diagrams

Images for a post live in `img/<slug>/`. Naming: `<slug>-0.png`, `<slug>-1.png`, … (zero-indexed). Single-image posts may use `<slug>.png`. Thumbnails (testbed only): `<slug>-thumbnail.png`.

## Hard rules

1. **Never write SVG by hand.** Hand-coded SVG paths are geometrically wrong almost every time. Use a math library.
2. **No matplotlib spines.** Always remove all four spines before saving:
   ```python
   for s in ax.spines.values():
       s.set_visible(False)
   ```
3. **`<figure>` is a sibling of the surrounding list, never a child of `<li>`.**
4. **Default width is 100%.** Use `70%` for narrow figures, `45%` × 2 for side-by-side.

## Library selection

| Need | Library | Notes |
|---|---|---|
| 2D geometry, math curves, scatter, lines | `matplotlib` | Spines off, no axis ticks unless meaningful, color-code consistently |
| Numerical work feeding into a plot | `numpy` | Compute first, plot once |
| 3D scenes, cameras, projection, frustums | `three.js` + headless Chromium | Real WebGL render, screenshot to PNG |
| Graphs, DAGs, trees | `matplotlib` + `networkx`, or `graphviz` | Use only if the topology actually carries the message |
| Data plots, regressions, confusion matrices | `matplotlib` | Same spine/styling rules |

## matplotlib pattern

```python
import matplotlib.pyplot as plt
import numpy as np

fig, ax = plt.subplots(figsize=(8, 6), dpi=200)

# ... plot here ...

# remove all spines (user has rejected bordered figures)
for s in ax.spines.values():
    s.set_visible(False)
ax.set_xticks([])
ax.set_yticks([])
ax.set_aspect("equal")

fig.tight_layout()
fig.savefig("img/<slug>/<slug>-0.png", bbox_inches="tight", pad_inches=0.05, transparent=False)
```

Color rules observed in this repo:
- Two-element comparison → blue (`#3b82f6` / matplotlib `tab:blue`) and green (`#22c55e` / `tab:green`).
- Window/crossing canonical: solid blue = window, dashed green = crossing.
- Selection / overlay rectangles: dashed border, translucent fill (alpha 0.15–0.30).
- Annotations / labels: short, no italic captions inside the figure (legend handles names).

## three.js + headless Chromium pattern

For 3D scenes, prefer real WebGL renders captured by Playwright / Puppeteer headless Chromium. matplotlib's `mpl_toolkits.mplot3d` produces flat-looking renders the user has rejected.

Skeleton:

1. Write `scripts/render_<slug>.html` containing a Three.js scene that:
   - Sets up the camera, geometry, lights, and any helpers (`THREE.CameraHelper`, `THREE.GridHelper`).
   - Renders to a canvas and exposes a global flag (e.g. `window.__rendered = true`) once render completes.
   - Optionally projects 3D points back to 2D for HTML overlay labels (use `Vector3.project(camera)`).
2. Run a headless Chromium screenshot:
   ```bash
   npx playwright install chromium  # one-time
   node scripts/render_<slug>.js    # opens the HTML, waits for __rendered, screenshots canvas
   ```
3. Write the resulting PNG to `img/<slug>/<slug>-<N>.png`.

Practical notes from past sessions:
- Use software WebGL flags if the headless render comes out blank.
- Build one canvas with two scissored viewports rather than two separate WebGL contexts (the second context often refuses to render in Chromium).
- For comparison panels (e.g., "outside-observer view" vs "user view"), construct the second camera explicitly — do **not** call `camera.clone()` (matrix staleness).
- Label points by projecting world coordinates back to canvas pixels and overlaying `<span>` elements with absolute positioning.

## When to add a diagram

Add a diagram when:
- The post explains a geometric construction, projection, or hit-test.
- The post derives a math formula and a figure makes the variables tangible.
- The user asks for one (e.g., "이 포스트에 다이어그램 적재적소에 넣어줘").

Skip a diagram when:
- The post is a short essay or keyword-jump.
- The math is one-liner and the equation reads itself.
- The figure would be decorative.

## Reference images

External reference images are allowed when they clarify the post. Prefer original papers, official docs, project pages, or license-friendly sources over reposts. For new posts, copy the image into `img/<slug>/` and use the normal `<slug>-N.{png,jpg}` naming convention rather than hotlinking.

Always cite the source:
- If the image itself is embedded, cite it in the `<figcaption>` when practical.
- If the image is only used as a visual reference for a generated diagram, cite it in the final `References:` section.

## Verification step (recommended)

After producing a diagram, briefly compare it against canonical references:
- 2D geometry → Wikipedia / sunshine2k / mathematicsart
- 3D projection → Scratchapixel, Songho, jsantell
- ML diagrams → original paper figures

This is a habit the user has explicitly asked for — "다이어그램이 적절한지 너가만든것과 인터넷에 떠돌아다니는 것과 비교."

If the canonical convention differs (e.g., color, label, axis orientation), match the canonical unless the post argues for a deliberate variation.

## Embedding HTML

Single image, full width:
```html
<figure>
    <img src="/img/<slug>/<slug>-0.png" width="100%" onerror=handle_image_error(this)>
</figure>
```

With caption:
```html
<figure>
    <img src="/img/<slug>/<slug>-0.png" width="70%" onerror=handle_image_error(this)>
    <figcaption>Caption text</figcaption>
</figure>
```

Side-by-side (testbed style):
```html
<figure style="display: flex;">
    <img src="/img/<slug>/<slug>-0.png" width="45%" onerror=handle_image_error(this)>
    <img src="/img/<slug>/<slug>-1.png" width="45%" onerror=handle_image_error(this)>
</figure>
<figcaption>From the left, original · processed</figcaption>
```

`onerror=handle_image_error(this)` is the repo's standard fallback handler — always include it.
