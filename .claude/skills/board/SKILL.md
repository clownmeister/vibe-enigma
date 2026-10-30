---
name: board
description: Check the lounge board - who has submitted, who updated, and capture competitors for comparison. Use when asked about other entries, standing, or whether anyone new appeared.
---

# The board

Entries:

```bash
curl -s https://devfest-vibe-lounge.web.app/api/entries | python3 -c "import sys,json; es=json.load(sys.stdin)['entries']; print(len(es)); [print(e.get('team'),'|',e.get('url'),'|',e.get('submittedAt','')[11:16]) for e in es]"
```

Who changed since last look: `curl -sI <url> | grep -i last-modified` per entry.

Capture a competitor at 1280 with a cache-busting query, then read the image and judge: first-glance impression, what they have that we lack, phone behaviour. Report the ranked standing with one line per entry and say plainly where we lose.

Our entry is "Lucián Blažek / FTMO" at https://clownmeister.github.io/vibe-enigma/. A deploy updates it; never POST to `/api/entries` again.
