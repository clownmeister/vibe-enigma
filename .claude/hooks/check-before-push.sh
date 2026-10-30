#!/usr/bin/env bash
# A push deploys. Refuse it unless the check suite is green right now.
set -u
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
case "$cmd" in
  *"git push"*)
    cd "$CLAUDE_PROJECT_DIR" || exit 0
    if ! npm run -s check >/tmp/vibe-enigma-check.log 2>&1; then
      echo "npm run check failed; see /tmp/vibe-enigma-check.log. A push deploys, fix first." >&2
      exit 2
    fi ;;
esac
exit 0
