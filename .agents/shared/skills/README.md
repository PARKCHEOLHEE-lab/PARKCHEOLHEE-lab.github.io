# Repo Skills

These repo-local skills are shared by Claude and Codex.

`.agents/shared/skills` is the canonical directory. `.claude/skills` and
`.codex/skills` are symlinks to this directory so both tools discover the same
skill files.

Available skills:

- `add-related`
- `build-latentspace`

If a skill is invoked but not shown in the active tool's skill list, open the
matching `SKILL.md` in this directory and follow it manually. Keep shared skills
portable; tool-specific hook or settings files belong under `.claude/` or
`.codex/`.
