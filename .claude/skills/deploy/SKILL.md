---
name: deploy
description: Ship the current master to GitHub Pages and confirm it landed. Use when the user says deploy, ship, push, release. A push deploys; the pre-push hook runs the check suite first.
---

# Deploy

1. `npm run check` is green (the push hook refuses otherwise).
2. `git add -A && git commit -m "<type>: <what>" && git push origin master`.
3. Wait for Actions, in the background, never a foreground sleep:

```bash
until gh run list -R clownmeister/vibe-enigma --limit 1 --json status,conclusion,headSha --jq '.[0] | select(.status=="completed") | .conclusion' | grep -q .; do sleep 15; done
gh run list -R clownmeister/vibe-enigma --limit 1 --json conclusion,headSha --jq '.[0] | "\(.conclusion) \(.headSha[0:7])"'
```

4. Smoke the live page: `curl -s "https://clownmeister.github.io/vibe-enigma/?$(date +%s)" | grep -c stage-canvas` returns 1, and a headless load of the page decodes `HELLO DEVFEST` to `IABEA NVTNZMA` with no console errors.
5. Tell the user the short SHA and that it is live. The board entry needs no resubmit.

Routes: `/` the landing with the 3D strip, `/3d/` the inspector, `/v1/` the classic page, `/og.png` the share image rendered from `/3d/?og`.
