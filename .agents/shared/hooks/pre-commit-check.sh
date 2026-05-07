#!/usr/bin/env bash
# PreToolUse Bash hook: enforce this repo's local checks before agent-driven
# `git commit` commands.
set -uo pipefail

if [[ -d "$HOME/.rbenv/shims" ]]; then
    export PATH="$HOME/.rbenv/shims:$PATH"
fi

if [[ -z "${LATENTSPACE_PYTHON:-}" && -x "$HOME/.venvs/latentspace/bin/python" ]]; then
    export LATENTSPACE_PYTHON="$HOME/.venvs/latentspace/bin/python"
fi

if [[ -t 0 ]]; then
    payload=""
else
    payload="$(cat 2>/dev/null || true)"
fi
if command -v jq >/dev/null 2>&1 && [[ -n "$payload" ]]; then
    CMD="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
else
    CMD="$payload"
fi

if ! printf '%s' "$CMD" | grep -Eq \
    '(^|[[:space:];&|()])git([[:space:]]+-[cC]([[:space:]]+[^[:space:]]+|=[^[:space:]]*))*[[:space:]]+commit([[:space:]]|$)'
then
    exit 0
fi

ROOT="${CODEX_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}}"

fail() {
    echo "[pre-commit] BLOCKED - $1" >&2
    exit 2
}

run_jekyll_build() {
    [[ -f "$ROOT/Gemfile" ]] || fail "Gemfile not found at $ROOT"
    command -v bundle >/dev/null 2>&1 || fail "bundle is not installed"

    echo "[pre-commit] bundle exec jekyll build" >&2
    (cd "$ROOT" && bundle exec jekyll build) >&2 || fail "jekyll build failed"
}

run_related_verify() {
    local script="$ROOT/.agents/shared/skills/add-related/scripts/verify_related.py"
    [[ -f "$script" ]] || fail "related verifier not found"

    echo "[pre-commit] verify related frontmatter" >&2
    (cd "$ROOT" && python3 "$script") >&2 || fail "related frontmatter verification failed"
}

run_latentspace_tests() {
    local test_file="$ROOT/.agents/shared/skills/build-latentspace/scripts/test_build_post_map.py"
    local python_bin="${LATENTSPACE_PYTHON:-python3}"
    [[ -f "$test_file" ]] || fail "latent-space tests not found"
    command -v "$python_bin" >/dev/null 2>&1 || fail "python not found: $python_bin"

    echo "[pre-commit] latent-space pytest" >&2
    if ! (cd "$ROOT" && "$python_bin" -c 'import pytest, openai, numpy, sklearn, bs4' >/dev/null 2>&1); then
        fail "missing Python deps for latent-space tests; rebuild the devcontainer or set LATENTSPACE_PYTHON to a venv with openai beautifulsoup4 lxml numpy scikit-learn pytest"
    fi

    (cd "$ROOT" && "$python_bin" -m pytest "$test_file" -v) >&2 || fail "latent-space tests failed"
}

staged="$(git -C "$ROOT" diff --cached --name-only 2>/dev/null || true)"

run_jekyll_build

if printf '%s\n' "$staged" | grep -Eq '^(note/_posts|testbed/_posts|\.agents/shared/skills/add-related/|\.claude/skills/add-related/|\.codex/skills/add-related/)'; then
    run_related_verify
fi

if printf '%s\n' "$staged" | grep -Eq '^(\.agents/shared/skills/build-latentspace/scripts/|\.claude/skills/build-latentspace/scripts/|\.codex/skills/build-latentspace/scripts/|\.github/workflows/build-latentspace\.yml)'; then
    run_latentspace_tests
fi

echo "[pre-commit] all checks passed" >&2
exit 0
