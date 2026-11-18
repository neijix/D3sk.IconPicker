#!/usr/bin/env bash
# The gate before every commit: both front-ends' tests, the same ones CI runs.
#   C#  : restore, build (warnings are errors), every xUnit test.
#   web : npm ci when node_modules is missing, then node --test.
#   then the code-health ratchet when its skill is installed.
# --full adds `npm pack --dry-run` (what npm would publish).
set -euo pipefail
cd "$(dirname "$0")"

full=0
for arg in "$@"; do
  case "$arg" in
    --full) full=1 ;;
    -h|--help) echo "usage: ./check.sh [--full]"; exit 0 ;;
    *) echo "check.sh: unknown argument '$arg' (usage: ./check.sh [--full])" >&2; exit 2 ;;
  esac
done

echo "== dotnet test"
dotnet test D3sk.IconPicker.slnx -c Release

echo "== npm test"
(
  cd packages/icon-picker
  if [ ! -d node_modules ]; then
    npm ci --no-audit --no-fund
  fi
  npm test
  if [ "$full" = 1 ]; then
    echo "== npm pack --dry-run"
    npm pack --dry-run
  fi
)

CH="$HOME/.agents/skills/code-health/scripts/code_health.py"
if [ -f "$CH" ]; then uv run -q "$CH" check; else echo "code-health: skill not installed, skipped"; fi
echo "check: OK"
