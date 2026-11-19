# Agent Workspace

- This file is the shared source of truth for repo instructions used by Claude and Codex.
- Root `AGENTS.md`, `.claude/CLAUDE.md`, and `.codex/AGENTS.md` are symlinks to this file.
- Shared repo-local skills live under `.agents/shared/skills`; `.claude/skills` and `.codex/skills` are discovery symlinks to that shared directory.
- Shared hook implementations live under `.agents/shared/hooks`; `.claude/hooks` and `.codex/hooks` are compatibility symlinks to that shared directory.
- Tool-specific hook registration config stays under `.claude/settings.json` and `.codex/hooks.json` because their schemas differ.
- Instruction history snapshots live under `.agents/shared/INSTRUCTIONS.history`; `.claude/CLAUDE.history` and `.codex/AGENTS.history` are compatibility symlinks into that shared directory.

# PARKCHEOLHEE Lab Blog Guidelines

This repository is the source for `PARKCHEOLHEE-lab.github.io`, a Jekyll-based personal technical blog and experiment archive.

## Project Overview

- **Tech stack**: Jekyll 4, Ruby/Bundler, Sass, vanilla JavaScript, Python helper scripts.
- **Primary content**: HTML posts with YAML frontmatter under `_posts/`; each post's `categories` field (`note` or `testbed`) says which kind it is.
- **Generated output**: `_site/` is build output and must not be edited by hand.
- **Latent space data**: `assets/data/latentspace.json` drives the D3 post map; `assets/data/embeddings.json` caches the post embeddings (Qwen3-Embedding-0.6B, run locally), and `assets/data/embedding-hashes.json` records which post text each cached vector came from.
- **Repo-local skills**: `add-related` maintains `related` frontmatter; `build-latentspace` rebuilds the post map data.

## Common Commands

```bash
# Build the static site
bundle exec jekyll build

# Serve locally
bundle exec jekyll serve --host 0.0.0.0 --port 4000

# Run the browser tests (dev/tests) against the built _site
npx playwright test -c dev/playwright.config.js

# Verify related-post frontmatter
python3 .agents/shared/skills/add-related/scripts/verify_related.py

# Run latent-space tests when Python deps are installed
python3 -m pytest .agents/shared/skills/build-latentspace/scripts/test_build_post_map.py -v

# Rebuild latent-space data locally; needs sentence-transformers on top of the test deps
~/.venvs/latentspace/bin/python .agents/shared/skills/build-latentspace/scripts/build_post_map.py

# Test the build step that adds lazy loading and skeleton boxes to content images (stdlib only)
python3 -m pytest _plugins/test_image_sizes.py -v
```

Python dependencies for the latent-space tests are installed in CI with:

```bash
pip install beautifulsoup4 lxml numpy scikit-learn pytest
```

The rebuild also needs `pip install sentence-transformers`, which brings torch and transformers; CI never installs it.

## Content Conventions

- Posts are HTML files with YAML frontmatter. Keep frontmatter fields stable unless the task explicitly targets them.
- Active posts live in `_posts/` and each sets `categories: note` or `categories: testbed` in its front matter; underscore-prefixed files are treated as drafts or disabled posts by local scripts.
- Post slugs are filename-derived: remove the `YYYY-MM-DD-` prefix and `.html` extension.
- `related` entries must use slugs only, not titles or filenames.
- Store post images under `img/` and reuse existing emoji assets under `assets/emoji/` when assigning labels.
- Do not edit generated `_site/` files; change source files and rebuild instead.

## Skill Workflow

Use the `add-related` skill when adding or refreshing related-post links. The canonical scripts are:

- `.agents/shared/skills/add-related/scripts/list_posts.py`
- `.agents/shared/skills/add-related/scripts/verify_related.py`

Use the `build-latentspace` skill when posts are added, removed, or labels need refreshing. The build script embeds posts locally with `Qwen/Qwen3-Embedding-0.6B` and rewrites:

- `assets/data/latentspace.json`
- `assets/data/embeddings.json`
- `assets/data/embedding-hashes.json`

GitHub Actions no longer rebuilds these files, so commit them with the post change. The first run downloads the model (about 1.1 GB) into the Hugging Face cache.

## Verification Rules

- For layout, Sass, include, config, or broad content changes, run `bundle exec jekyll build`.
- For `related` frontmatter changes, run `python3 .agents/shared/skills/add-related/scripts/verify_related.py`.
- For latent-space script changes, run the pytest command above after installing the Python dependencies.
- For `_plugins/image_sizes.py` changes, run its pytest command above, then `bundle exec jekyll build` and `npx playwright test -c dev/playwright.config.js images.spec.js`.
- For agent-structure changes, run `bash .agents/setup-symlinks.sh` and verify the symlinks with `find .agents .claude .codex -maxdepth 3`.

<!-- setup-design-system: do not edit between markers -->
## Design System

This project's UI rules and design tokens live in [dev/DESIGN.md](/dev/DESIGN.md).
Read it before any Sass, layout, include, or post-style change.

- Tokens are Sass variables in `_sass/index.sass`. Reference them; do not
  add raw hex literals to other partials.
- Two zones are explicitly excluded from token discipline: the Monokai
  syntax-highlight palette in `_sass/classes.sass` and the D3 categorical
  palette in `_sass/latentspace.sass`.
- There is no stylelint enforcement (Sass+Jekyll); the agent and reviewer
  are the gate.

A migration backlog of raw hex still in `_sass/basic.sass` is listed in
DESIGN.md — migrate one rule cluster per PR.
<!-- /setup-design-system -->

## Git Workflow

- Never push directly to remote `main`; use a feature branch and PR.
- Before creating a PR that modifies a directory, also run `git status --short <dir>` to catch untracked files.
- Do not hardcode local machine paths in committed files.
- Keep local tool permissions in `.claude/settings.local.json`; it is intentionally ignored. Shared settings belong in `.claude/settings.json`, `.codex/config.toml`, and `.codex/hooks.json`.
