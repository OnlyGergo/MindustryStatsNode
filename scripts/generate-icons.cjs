/**
 * Regenerates every site icon from the animated logo, frontend/src/assets/tower-loader.svg:
 *   frontend/public/favicon.svg           - its first frame, as a static SVG (also the top bar logo)
 *   frontend/public/apple-touch-icon.png  - 180x180 on the theme background
 *   frontend/public/icons/icon-{192,512}.png, icon-maskable-512.png (PWA manifest)
 *
 * The first frame is baked by Chromium itself: the SVG is loaded, its timeline paused at t=0,
 * and each animated element's live opacity/transform read back, so this works on any SMIL
 * the source uses (and on Inkscape-formatted exports). Elements invisible at t=0 are dropped.
 * The top bar swaps the animated file in on hover; that relies on its last frame matching the
 * first, so keep the loop seamless when editing the animation.
 *
 * Needs Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`
 * if it isn't already on the machine). Run from the repo root: `bun run icons`.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'frontend/public');
const SOURCE = path.join(root, 'frontend/src/assets/tower-loader.svg');
const BACKGROUND = '#0f0f0f'; // manifest background_color / theme-color

const PNGS = [
  // [file, size, opaque background?]
  ['apple-touch-icon.png', 180, true], // iOS shows transparency as black anyway
  ['icons/icon-192.png', 192, false],
  ['icons/icon-512.png', 512, false],
  ['icons/icon-maskable-512.png', 512, true], // the frame sits inside the 80% safe zone
];

/** Runs in the page: bake t=0 into a static SVG string. */
function bakeFirstFrame() {
  const svg = document.querySelector('svg');
  svg.pauseAnimations();
  svg.setCurrentTime(0);

  const anims = [...svg.querySelectorAll('animate, animateTransform, animateMotion, set')];
  const targets = new Set(anims.map((a) => a.parentElement));
  for (const el of targets) {
    if (el.transform) {
      const list = el.transform.animVal; // read-only, so multiply the items out by hand
      let m = svg.createSVGMatrix();
      for (let i = 0; i < list.numberOfItems; i++) m = m.multiply(list.getItem(i).matrix);
      const r = (n) => +n.toFixed(4);
      if (m.isIdentity ?? (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0)) el.removeAttribute('transform');
      else el.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(r).join(',')})`);
    }
    const opacity = getComputedStyle(el).opacity;
    el.setAttribute('opacity', opacity);
  }
  anims.forEach((a) => a.remove());

  // Drop anything invisible on frame one (e.g. bullets mid-cycle), and editor cruft.
  svg.querySelectorAll('[opacity="0"]').forEach((el) => el.remove());
  svg.querySelectorAll('*').forEach((el) => {
    if (el.tagName.includes(':')) return el.remove(); // sodipodi:namedview etc.
    for (const a of [...el.attributes]) if (a.name.includes(':') && !a.name.startsWith('xmlns')) el.removeAttribute(a.name);
    if (el.getAttribute('opacity') === '1') el.removeAttribute('opacity');
  });
  for (const a of [...svg.attributes]) if (/^xmlns:(inkscape|sodipodi|svg)$/.test(a.name)) svg.removeAttribute(a.name);
  // Empty groups left behind by removed children
  let again = true;
  while (again) {
    again = false;
    svg.querySelectorAll('g').forEach((g) => { if (!g.children.length) { g.remove(); again = true; } });
  }
  const walker = document.createTreeWalker(svg, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  return new XMLSerializer()
    .serializeToString(svg)
    .replace(/<(\w+)([^<>]*)>\s*<\/\1>/g, '<$1$2/>') // <circle …>\n</circle> -> <circle …/>
    .replace(/\n\s*\n/g, '\n');
}

(async () => {
  const source = fs.readFileSync(SOURCE, 'utf8').replace(/^<\?xml[^>]*>\s*/, '');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body>${source}</body>`);
    const favicon = `<?xml version="1.0" encoding="UTF-8"?>\n${await page.evaluate(bakeFirstFrame)}\n`;
    fs.writeFileSync(path.join(pub, 'favicon.svg'), favicon);
    console.log('wrote frontend/public/favicon.svg');
    await page.close();

    for (const [file, size, opaque] of PNGS) {
      const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      const sized = favicon
        .replace(/^<\?xml[^>]*>\s*/, '')
        .replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
      await p.setContent(
        `<!doctype html><body style="margin:0;background:${opaque ? BACKGROUND : 'transparent'}">${sized}</body>`,
      );
      await p.screenshot({
        path: path.join(pub, file),
        omitBackground: !opaque,
        clip: { x: 0, y: 0, width: size, height: size },
      });
      await p.close();
      console.log(`wrote frontend/public/${file}`);
    }
  } finally {
    await browser.close();
  }
})();
