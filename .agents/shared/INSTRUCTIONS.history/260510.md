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
- **Primary content**: HTML posts with YAML frontmatter under `note/_posts` and `testbed/_posts`.
- **Generated output**: `_site/` is build output and must not be edited by hand.
- **Latent space data**: `data/latentspace.json` drives the D3 post map; `data/embeddings.json` caches OpenAI embeddings.
- **Repo-local skills**: `add-related` maintains `related` frontmatter; `build-latentspace` rebuilds the post map data.

## Common Commands

```bash
# Build the static site
bundle exec jekyll build

# Serve locally
bundle exec jekyll serve --host 0.0.0.0 --port 4000

# Verify related-post frontmatter
python3 .agents/shared/skills/add-related/scripts/verify_related.py

# Run latent-space tests when Python deps are installed
python3 -m pytest .agents/shared/skills/build-latentspace/scripts/test_build_post_map.py -v

# Rebuild latent-space data; requires OPENAI_API_KEY and Python deps
python3 .agents/shared/skills/build-latentspace/scripts/build_post_map.py
```

Python dependencies for latent-space work are installed in CI with:

```bash
pip install openai beautifulsoup4 lxml numpy scikit-learn pytest
```

## Content Conventions

- Posts are HTML files with YAML frontmatter. Keep frontmatter fields stable unless the task explicitly targets them.
- Active posts live in `note/_posts` and `testbed/_posts`; underscore-prefixed files are treated as drafts or disabled posts by local scripts.
- Post slugs are filename-derived: remove the `YYYY-MM-DD-` prefix and `.html` extension.
- `related` entries must use slugs only, not titles or filenames.
- Store post images under `img/` and reuse existing emoji assets under `emoji/` when assigning labels.
- Do not edit generated `_site/` files; change source files and rebuild instead.

## Skill Workflow

Use the `add-related` skill when adding or refreshing related-post links. The canonical scripts are:

- `.agents/shared/skills/add-related/scripts/list_posts.py`
- `.agents/shared/skills/add-related/scripts/verify_related.py`

Use the `build-latentspace` skill when posts are added, removed, or labels need refreshing. The build script embeds posts with OpenAI and rewrites:

- `data/latentspace.json`
- `data/embeddings.json`

Do not run `build-latentspace` without confirming `OPENAI_API_KEY` is available; it can call a paid API.

## Verification Rules

- For layout, Sass, include, config, or broad content changes, run `bundle exec jekyll build`.
- For `related` frontmatter changes, run `python3 .agents/shared/skills/add-related/scripts/verify_related.py`.
- For latent-space script changes, run the pytest command above after installing the Python dependencies.
- For agent-structure changes, run `bash .agents/setup-symlinks.sh` and verify the symlinks with `find .agents .claude .codex -maxdepth 3`.

## Git Workflow

- Never push directly to remote `main`; use a feature branch and PR.
- Before creating a PR that modifies a directory, also run `git status --short <dir>` to catch untracked files.
- Do not hardcode local machine paths in committed files.
- Keep local tool permissions in `.claude/settings.local.json`; it is intentionally ignored. Shared settings belong in `.claude/settings.json`, `.codex/config.toml`, and `.codex/hooks.json`.
