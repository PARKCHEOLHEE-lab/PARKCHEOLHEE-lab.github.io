---
name: add-related
description: Add or update related frontmatter for all blog posts in note/_posts and testbed/_posts. Run when user wants to refresh related post links across the entire site.
user-invocable: true
allowed-tools: "Read Edit Bash Glob Grep Agent"
hooks:
  PreToolUse:
    - matcher: "Agent"
      hooks:
        - type: prompt
          prompt: |
            Check that the Agent prompt references the canonical post list file at /tmp/post_list.txt.
            This file is produced by list_posts.py and is the ONLY valid source of post slugs.
            If the prompt does NOT reference /tmp/post_list.txt (either by reading it or including its content), say BLOCK: "Sub-agent must use the canonical post list from /tmp/post_list.txt".
            Otherwise say ALLOW.
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

You are updating the `related` frontmatter field for every eligible blog post. This must run to completion without stopping.

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

Read every post's frontmatter and first ~50 lines of content to understand its topic. Group posts mentally by theme:
- Machine learning / deep learning (GAN, VAE, transformer, loss functions, optimizers, etc.)
- Mathematics (linear algebra, calculus, probability, statistics)
- Programming / tools (Python, Docker, Git, testing, dev setup)
- Architecture / computational design (generative design, geometry, Rhino/Grasshopper)
- Books / essays / philosophy
- etc.

## Step 3: Process each post via sub-agent debate

For **every single post** from `/tmp/post_list.txt` (no exceptions, no skipping), regardless of whether it already has a `related:` field:

### 3a. Spawn a sub-agent to evaluate related posts

For each post (or a small batch of posts), launch a sub-agent (Agent tool) that:

1. **Reads `/tmp/post_list.txt`** to get the canonical candidate pool
2. **Reads the post's full content** to understand what it's about
3. **Proposes MIN_RELATED–MAX_RELATED related posts with justification** for each connection, using the relatedness criteria below
4. **Briefly sanity-checks each proposal**: For every candidate, ask "would a reader actually benefit from seeing this link?" Only drop the candidate if you cannot articulate a concrete benefit to the reader.
5. **Returns a final list** of slug(s) with one-line justifications

**Important**: The sub-agent prompt MUST instruct the agent to read `/tmp/post_list.txt` for the candidate pool. A PreToolUse hook enforces this.

### 3b. Apply the result

Compare the sub-agent's recommendation with the post's existing `related:` field:
- If the existing list matches the recommendation, **skip** (no edit needed)
- If changes are needed, use the Edit tool to update the frontmatter

### Relatedness criteria (for the sub-agent)

Connections must satisfy **at least one** of:
- **Conceptual chain**: Post A teaches a concept that Post B builds upon (or vice versa) (e.g., `likelihood` → `maximum-likelihood-estimation` → `bayes-theorem`)
- **Same topic, different angle**: Both posts explore the same subject but from different perspectives (e.g., a theory note and its testbed implementation)
- **Shared domain, complementary content**: Both posts belong to the same study area and a reader learning that area would benefit from reading both (e.g., `dot-product` and `intuitive-understanding-of-linear-algebra` are both linear algebra fundamentals; `dropout` and `normalization-layers` are both regularization/training techniques)
- **Thematic resonance**: Posts that explore overlapping philosophical, literary, or reflective themes (e.g., existentialist novels like `nausea`, `no-exit`, `the-myth-of-sisyphus` share genuine thematic connections beyond just being "books")

Connections must **NOT** be based on:
- Superficial keyword overlap with no conceptual link (e.g., both mention "Python" but cover unrelated topics)
- Shared format alone (e.g., both are cheat sheets for completely different tools)
- Mere proximity in time (e.g., posted in the same week but unrelated topics)

### Sub-agent prompt template

When spawning the sub-agent, include:
- Instruction to **read `/tmp/post_list.txt`** for the canonical post list (slug + title)
- The target post's filepath, slug, title
- The relatedness criteria above
- Instruction to return a structured result: `slug: justification` for each recommended connection, plus any connections it considered and rejected (with reason)

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
- Prefer bidirectional relatedness: if A relates to B, B should likely relate to A

### Posts with no related content

Some posts are truly standalone (e.g., a short personal essay, a one-off tool config note). Set these to:

```yaml
related:
```

This is valid — an empty related list with 0 items.

## Step 5: Verify

After processing ALL posts, run the verification script:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/verify_related.py"
```

If verification fails, fix every reported issue before finishing.

## Important rules

- **Do not stop mid-loop.** Process all posts in one session.
- **Do not hallucinate slugs.** Only use slugs from `/tmp/post_list.txt`.
- **Respect the MIN_RELATED–MAX_RELATED limit.** See `scripts/config.py`.
- **Preserve other frontmatter fields.** Only modify the `related:` block. Do not touch title, layout, emoji, hashtag, thumbnail, featured, comment, splitter, or any other field.
- **Every connection must be justified.** No related link should exist without a clear reason.
