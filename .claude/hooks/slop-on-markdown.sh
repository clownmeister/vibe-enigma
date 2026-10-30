#!/usr/bin/env bash
# After a markdown write, flag AI-writing artefacts so they never reach the repo.
set -u
input=$(cat)
file=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
case "$file" in
  *.md) python3 "$CLAUDE_PROJECT_DIR/scripts/slopcheck.py" "$file" >&2 || exit 2 ;;
esac
exit 0
