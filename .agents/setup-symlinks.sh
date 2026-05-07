#!/usr/bin/env bash
# Recreate this repo's local agent symlink layout.
#
# Canonical content lives under .agents/shared. Claude/Codex-specific paths are
# discovery and compatibility entrypoints that point back to the shared files.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

link_path() {
  local target="$1"
  local link="$2"

  mkdir -p "$(dirname "$link")"

  if [[ -L "$link" ]]; then
    local current
    current="$(readlink "$link")"
    if [[ "$current" == "$target" ]]; then
      printf 'ok     %s -> %s\n' "$link" "$target"
      return 0
    fi

    rm "$link"
  elif [[ -e "$link" ]]; then
    printf 'refuse %s exists and is not a symlink\n' "$link" >&2
    return 1
  fi

  ln -s "$target" "$link"
  printf 'linked %s -> %s\n' "$link" "$target"
}

mkdir -p \
  .agents/shared/hooks \
  .agents/shared/skills \
  .agents/shared/instructions-history

link_path ".agents/shared/INSTRUCTIONS.md" "AGENTS.md"
link_path "../.agents/shared/INSTRUCTIONS.md" ".codex/AGENTS.md"
link_path "../.agents/shared/INSTRUCTIONS.md" ".claude/CLAUDE.md"

link_path "../.agents/shared/skills" ".codex/skills"
link_path "../.agents/shared/skills" ".claude/skills"

link_path "../.agents/shared/hooks" ".codex/hooks"
link_path "../.agents/shared/hooks" ".claude/hooks"

link_path "../.agents/shared/instructions-history" ".codex/AGENTS.history"
link_path "../.agents/shared/instructions-history" ".claude/CLAUDE.history"

printf 'done\n'
