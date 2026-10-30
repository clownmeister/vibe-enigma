---
name: screenshot
description: Capture the page at laptop and phone widths with Playwright and read the images. Use before reporting any UI change as done; the judges open the entry on both.
---

# Screenshot

Serve the production build: `npm run build && npx vite preview --port 4173 --strictPort` in the background, which serves http://localhost:4173/vibe-enigma/.

Playwright is not a dependency of this repo. Borrow a sibling checkout that has it, for example `../chalupario/e2e`, and run the script from there so `require('playwright')` resolves. The 3D strip needs software GL in headless Chromium, so pass `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` and wait about six seconds for the scene.

```bash
cd ../chalupario/e2e && node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, width] of [['laptop', 1280], ['phone', 390]]) {
    const p = await b.newPage({ viewport: { width, height: 1000 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://localhost:4173/vibe-enigma/'); await p.waitForTimeout(6000);
    await p.fill('#input', 'HELLO DEVFEST'); await p.waitForTimeout(1500);
    await p.screenshot({ path: '/tmp/vibe-enigma-' + name + '.png', fullPage: true });
    console.log(name, 'output:', await p.textContent('#output'), 'errors:', errs);
  }
  await b.close();
})()"
```

Then Read both PNGs. The output line must be `IABEA NVTNZMA` and the errors list empty. Look for: clipped text, wrapped nav, native controls showing through, the machine below the fold on the phone, anything that reads as a template. For the 3D model itself use the `render-3d` skill.
