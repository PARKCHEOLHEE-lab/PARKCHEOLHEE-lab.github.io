---
name: add-related
description: Add or update related frontmatter for blog posts in note/_posts and testbed/_posts. Supports a full-site pass (--all=true, default) or a single-post focus pass (--post-name=<slug>). Run when user wants to refresh related post links.
user-invocable: true
allowed-tools: "Read Edit Bash Glob Grep"
hooks:
  PostToolUse:
    - matcher: "Edit"
      hooks:
        - type: prompt
          prompt: |
            Check if the edit just made correctly modifies the `related:` frontmatter in a blog post.
            The related field must be a YAML list with MIN_RELATED to MAX_RELATED slug items (see scripts/config.py for values).
            Only check the YAML structure and count. Do NOT try to verify whether slugs exist — the verification script handles that.
            If the structure or count looks wrong, say BLOCK and explain why. Otherwise say ALLOW.
---

# Add Related Posts

You are updating the `related` frontmatter field for blog posts. This must run to completion without stopping.

## Arguments

Parse the slash-command `ARGUMENTS:` line for the following flags. Both are optional.

| Flag | Values | Default | Meaning |
|---|---|---|---|
| `--all` | `true` / `false` | `true` | Full-site mode. Evaluate every eligible post. |
| `--post-name` | `<slug>` (no date prefix, no extension) | _(none)_ | Single-post focus mode. Only the given post and posts whose `related:` should pick it up are evaluated. |

Mode resolution rules:

- If `--post-name=<slug>` is provided, run **focus mode** regardless of `--all`. Validate the slug exists in `/tmp/post_list.txt`; if not, abort with a clear error.
- Otherwise, if `--all=false` is set without `--post-name`, abort and ask the user to either pass `--post-name=<slug>` or set `--all=true`.
- Otherwise (no args, or `--all=true`), run **full-site mode**.

Echo the resolved mode at the start so the user can confirm:

```
mode: full-site        (--all=true)
mode: focus            (--post-name=<slug>)
```

## Step 0: Read limits from config

The single source of truth for min/max related counts is `scripts/config.py`. Print it to confirm:

```bash
python3 -c "import sys; sys.path.insert(0,'${CLAUDE_SKILL_DIR}/scripts'); from config import *; print(f'MIN_RELATED={MIN_RELATED}, MAX_RELATED={MAX_RELATED}')"
```

All references to "minimum" or "maximum" related counts below mean these values. **Do not hardcode numbers — always refer to config.py.**

## Step 1: Generate the canonical post list

Run the list script and save its output to a fixed file. This file is the **single source of truth** for all slugs.

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/list_posts.py" > /tmp/post_list.txt
```

Print the count to confirm:

```bash
wc -l /tmp/post_list.txt
```

**Do NOT manually scan `_posts/` directories or write your own filtering.** The canonical list at `/tmp/post_list.txt` is the only valid source.

## Step 2: Build a content index

Read each post's frontmatter and first ~50 lines of content to understand its topic. Group posts mentally by theme:
- Machine learning / deep learning (GAN, VAE, transformer, loss functions, optimizers, etc.)
- Mathematics (linear algebra, calculus, probability, statistics)
- Programming / tools (Python, Docker, Git, testing, dev setup)
- Architecture / computational design (generative design, geometry, Rhino/Grasshopper)
- Books / essays / philosophy
- etc.

In **focus mode**, you may scope this index narrower (e.g., only posts in the same category or that share keywords with the target), but `/tmp/post_list.txt` remains the only valid slug source.

## Step 3: Evaluate posts directly

Evaluate posts yourself — do **not** spawn sub-agents via the `claude` CLI. Taking longer is acceptable; the trade-off here is consistency over speed. The exact set of posts you evaluate depends on the mode.

### Full-site mode (`--all=true`)

Process **every single post** from `/tmp/post_list.txt` (no exceptions, no skipping), regardless of whether it already has a `related:` field.

### Focus mode (`--post-name=<slug>`)

Two passes:

1. **Target-out pass.** Fully re-evaluate the target post `<slug>`. Propose MIN_RELATED–MAX_RELATED related posts as you would in full-site mode.
2. **Fan-in pass.** For every other post in `/tmp/post_list.txt`, evaluate **only one question**: "should `<slug>` be added to this post's `related:`?" Do not reshuffle, reorder, or remove that post's existing related links.
   - If yes and adding `<slug>` keeps the count ≤ MAX_RELATED → append the slug.
   - If yes but the post is already at MAX_RELATED → record a justified **swap proposal** (which existing link to drop, why) in the decisions log; do **not** auto-swap. The re-review step (Step 5) is where this is resolved.
   - If no → leave the post untouched.

This makes focus mode minimally invasive: only the target gets a full re-shuffle; others only gain (or propose-to-swap) a single link.

### Per-post procedure

For each post you evaluate:

1. **Read the post's full content** to understand what it teaches/argues.
2. **Cross-reference `/tmp/post_list.txt`** as the canonical candidate pool. Only slugs in this file are valid.
3. **Propose links** per the rules of the active mode (full reshuffle vs. fan-in single-link).
4. **Write a one-line justification for EVERY proposed link** that cites which criterion it satisfies and what concrete connection exists. If you cannot write a concrete, specific justification (beyond "both are dev tools" or "both are notes"), **drop the link**. A link without a real justification is a hallucinated link — leave it out.
5. **Append your decision** to the decisions log at `/tmp/related-decisions.txt` in the format below, then apply the edit. The `RELATED:` line contains ONLY slugs (no justification inline). Justifications go in the `REASONS:` block below it for auditing in Step 5.

```
POST: slug
MODE: full-site | focus-target | focus-fan-in
RELATED: slug1, slug2, slug3
REASONS:
  - slug1: <one-line concrete justification citing a criterion>
  - slug2: <one-line concrete justification citing a criterion>
  - slug3: <one-line concrete justification citing a criterion>
SWAP_PROPOSAL: <only if focus-fan-in and post was at MAX_RELATED — "drop X to add <target>: <reason>">
---
```

**Anti-example — do NOT do this:**
```
POST: wslconfig
RELATED: asdf
REASONS:
  - asdf: both are dev-environment tool configs  ← REJECT: this is shared-format-only, no conceptual link. Drop it.
```

### Apply the result

Compare your decision with the post's existing `related:` field:
- If the existing list matches your decision, **skip** (no edit needed).
- If changes are needed, use the Edit tool to update the frontmatter.
- For `focus-fan-in` entries with a `SWAP_PROPOSAL`, do **not** edit yet — defer the decision to Step 5.

### Relatedness criteria

Connections must satisfy **at least one** of:
- **Conceptual chain**: Post A teaches a concept that Post B builds upon (or vice versa) (e.g., `likelihood` → `maximum-likelihood-estimation` → `bayes-theorem`)
- **Same topic, different angle**: Both posts explore the same subject but from different perspectives (e.g., a theory note and its testbed implementation)
- **Shared domain, complementary content**: Both posts belong to the same study area and a reader learning that area would benefit from reading both (e.g., `dot-product` and `intuitive-understanding-of-linear-algebra` are both linear algebra fundamentals; `dropout` and `normalization-layers` are both regularization/training techniques)
- **Thematic resonance**: Posts that explore overlapping philosophical, literary, or reflective themes (e.g., existentialist novels like `nausea`, `no-exit`, `the-myth-of-sisyphus` share genuine thematic connections beyond just being "books")

Connections must **NOT** be based on:
- Superficial keyword overlap with no conceptual link (e.g., both mention "Python" but cover unrelated topics)
- Shared format alone (e.g., both are cheat sheets for completely different tools)
- Mere proximity in time (e.g., posted in the same week but unrelated topics)

## Step 4: Apply edits

### Related field format

```yaml
related:
  - slug-one
  - slug-two
  - slug-three
```

- Use **slugs only** (not filenames, not titles)
- Minimum MIN_RELATED, maximum MAX_RELATED related posts (see `scripts/config.py`)
- A post must NOT reference itself
- **Edges may be asymmetric.** Bidirectional relatedness (A→B and B→A) is **not required**. If A→B is justified by the relatedness criteria but B→A is not (e.g., B is a foundational concept and A is a specific application), it is correct to record only A→B and leave B's list untouched.

### Posts with no related content

Some posts are truly standalone (e.g., a short personal essay, a one-off tool config note). Set these to:

```yaml
related:
```

This is valid — an empty related list with 0 items.

## Step 5: Re-review the decisions log

After all per-post evaluations and edits, walk through `/tmp/related-decisions.txt` once more and decide, for **every justification**, whether to **keep** or **reject** it. The justifications were written under per-post focus; rereading them as a batch surfaces weak reasoning that looked plausible in isolation.

For each entry in the log:

1. Re-read the target post briefly (no need for the full body again).
2. For each `slug: <justification>` line, ask:
   - Does the justification cite a concrete connection to a specific criterion (1–4)?
   - Could the same justification be cut-and-pasted to an unrelated pair? If yes, it is generic — **reject**.
   - Is the connection actually present in the post body, or did I infer it from the title alone?
3. Mark the line `KEEP` or `REJECT` (with one-line reason for each rejection).
4. **Resolve `SWAP_PROPOSAL` entries** (focus-fan-in mode only):
   - If the proposed swap reads stronger than the link it would replace → apply the swap via Edit.
   - Otherwise → drop the proposal. Do not exceed MAX_RELATED.
5. For every `REJECT`, use the Edit tool to remove that slug from the post's `related:` field. If a rejection drops the post below MIN_RELATED, that is acceptable (an empty `related:` is valid for genuinely standalone posts).

Append the re-review outcome under each entry in the same log file:

```
POST: slug
RELATED: slug1, slug2, slug3
REASONS:
  - slug1: <justification>     [KEEP]
  - slug2: <justification>     [REJECT — reason]
  - slug3: <justification>     [KEEP]
SWAP_PROPOSAL: ...             [APPLIED | DROPPED — reason]
---
```

This step is **not optional**. The justification block is the audit trail and the rejection pass is what catches the over-eager "this kinda sounds related" links that the per-post pass tends to wave through.

## Step 6: Verify

After re-review, run the verification script:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/verify_related.py"
```

If verification fails, fix every reported issue before finishing.

## Important rules

- **Do not stop mid-loop.** Process every post in scope (full-site or focus) in one session, including the Step 5 re-review.
- **Do not hallucinate slugs.** Only use slugs from `/tmp/post_list.txt`.
- **Respect the MIN_RELATED–MAX_RELATED limit.** See `scripts/config.py`.
- **Preserve other frontmatter fields.** Only modify the `related:` block. Do not touch title, layout, emoji, hashtag, thumbnail, featured, comment, splitter, or any other field.
- **Every connection must be justified.** No related link should exist without a clear reason that survives Step 5 re-review.
- **Edges may be asymmetric.** Do not auto-mirror A→B as B→A; each direction must independently satisfy the criteria.
- **Focus mode is minimally invasive.** In `--post-name` mode, never reorder or remove existing links from non-target posts. Only add (or, via swap proposal, swap one for one).
