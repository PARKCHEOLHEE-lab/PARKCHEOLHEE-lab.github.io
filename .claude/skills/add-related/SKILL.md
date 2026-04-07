---
name: add-related
description: Add or update related frontmatter for all blog posts in note/_posts and testbed/_posts. Run when user wants to refresh related post links across the entire site.
user-invocable: true
allowed-tools: "Read Edit Bash Glob Grep"
hooks:
  PostToolUse:
    - matcher: "Edit"
      hooks:
        - type: prompt
          prompt: |
            Check if the edit just made correctly modifies the `related:` frontmatter in a blog post.
            The related field must be a YAML list with 0-5 slug items. Each slug must exist as an actual post.
            If the edit looks wrong, say BLOCK and explain why. Otherwise say ALLOW.
---

# Add Related Posts

You are updating the `related` frontmatter field for every eligible blog post. This must run to completion without stopping.

## Step 1: Collect all posts

Run the list script to get every eligible post:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/list_posts.py"
```

This outputs `filepath|slug|title` for each post. Save this full list — you need it as the pool of candidates for related posts.

## Step 2: Build a content index

Read every post's frontmatter and first ~50 lines of content to understand its topic. Group posts mentally by theme:
- Machine learning / deep learning (GAN, VAE, transformer, loss functions, optimizers, etc.)
- Mathematics (linear algebra, calculus, probability, statistics)
- Programming / tools (Python, Docker, Git, testing, dev setup)
- Architecture / computational design (generative design, geometry, Rhino/Grasshopper)
- Books / essays / philosophy
- etc.

## Step 3: Process each post

For **every single post** from the list (no exceptions, no skipping):

1. Read the post content
2. Evaluate its existing `related:` frontmatter (if any)
3. Determine 0–5 related posts from the candidate pool based on:
   - **Topic similarity**: posts covering the same or closely adjacent concepts
   - **Conceptual dependency**: prerequisite or follow-up posts (e.g., `gan` → `conditional-gan`)
   - **Cross-category links**: connect note posts with their testbed implementations when relevant
4. Use the Edit tool to update the frontmatter

### Related field format

```yaml
related:
  - slug-one
  - slug-two
  - slug-three
```

- Use **slugs only** (not filenames, not titles)
- Minimum 0, maximum 5 related posts
- A post must NOT reference itself
- If existing related entries are appropriate, keep them. Remove only those that are clearly irrelevant.
- Prefer bidirectional relatedness: if A relates to B, B should likely relate to A

### Posts with no related content

Some posts are truly standalone (e.g., a book review with no other book reviews, a one-off tool note). Set these to:

```yaml
related:
```

This is valid — an empty related list with 0 items.

## Step 4: Verify

After processing ALL posts, run the verification script:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/verify_related.py"
```

If verification fails, fix every reported issue before finishing.

## Important rules

- **Do not stop mid-loop.** Process all 190+ posts in one session.
- **Do not hallucinate slugs.** Only use slugs from the list-posts.sh output.
- **Respect the 0–5 limit.** No post should have more than 5 related entries.
- **Preserve other frontmatter fields.** Only modify the `related:` block. Do not touch title, layout, emoji, hashtag, thumbnail, featured, comment, splitter, or any other field.
