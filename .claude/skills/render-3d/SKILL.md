---
name: render-3d
description: Render the Three.js Enigma from fixed camera angles and slider positions, read the images, and catch the defects software renders show (z-fighting, parts through walls, wrong tilt, coplanar faces). Use after any change under src/three/ and before a push.
---

# Render the 3D model

The inspector at `/3d/` takes query parameters for deterministic captures:

- `?og` hides the chrome and stops the breathing and auto-rotate
- `&cam=x,y,z&at=x,y,z` fixes the camera and its target
- `#m=HELLO%20DEVFEST` sets the message so a beam and a lit lamp show

Headless Chromium has no GPU, so launch it with software GL:

```bash
cd ../chalupario/e2e && node -e "
const {chromium}=require('playwright');(async()=>{
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for (const [name,ex] of [['start',0],['lid',30],['open',100]]) {
  const p=await b.newPage({viewport:{width:1200,height:800},deviceScaleFactor:2});
  await p.goto('http://localhost:4173/vibe-enigma/3d/?og&cam=3.4,3.2,7.4&at=0,-0.6,0.2#m=HELLO%20DEVFEST'); await p.waitForTimeout(5000);
  await p.evaluate(v=>{const e=document.getElementById('explode'); e.value=String(v); e.dispatchEvent(new Event('input'));}, ex);
  await p.waitForTimeout(1200); await p.screenshot({path:'/tmp/enigma-'+name+'.png'}); await p.close(); }
await b.close()})()"
```

Useful cameras: `3.4,3.2,7.4` at `0,-0.6,0.2` (three-quarter front), `0.5,7.5,0.8` at `0,-1,0` (top), `0,5,6` at `0,-1,0.6` (front high). Mouse-drag orbits in headless are unreliable; use the parameters.

Read every image. Look for: black discs where a rotor face should show pins (a cap or wrong rotation), a letter band standing edge-on (the tyre rotated twice), flicker between brass and black (coplanar faces, offset by 0.004), parts outside the case at slider 100 (explode travel not clamped), a board showing its underside (tilt sign), cables leaving through a wall (harness points outside CASE).

Software renders are darker and softer than a GPU; judge geometry and layout, not shading.
