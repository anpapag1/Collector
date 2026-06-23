const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'Collector_Logo.svg');
const BG = '#2589C8';

async function logoOnBg({ size, padRatio = 0, bg = null }) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const logo = await sharp(SVG, { density: 384 }).resize(inner, inner, { fit: 'contain' }).png().toBuffer();
  let img = sharp({
    create: { width: size, height: size, channels: 4, background: bg || { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  return img
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function monochrome({ size, padRatio = 0 }) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const logo = await sharp(SVG, { density: 384 })
    .resize(inner, inner, { fit: 'contain' })
    .toColourspace('b-w')
    .png()
    .toBuffer();
  // Use alpha-extracted shape painted white, to act as a themed-icon mask source.
  const alpha = await sharp(SVG, { density: 384 })
    .resize(inner, inner, { fit: 'contain' })
    .ensureAlpha()
    .extractChannel('alpha')
    .toBuffer();
  const white = await sharp({ create: { width: inner, height: inner, channels: 4, background: '#ffffff' } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: white, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function solidBg(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .png()
    .toBuffer();
}

async function writePng(buf, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('wrote', path.relative(ROOT, dest));
}

async function writeWebp(buf, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const webp = await sharp(buf).webp().toBuffer();
  fs.writeFileSync(dest, webp);
  console.log('wrote', path.relative(ROOT, dest));
}

(async () => {
  // --- top-level expo assets (app.json) ---
  await writePng(await logoOnBg({ size: 512, padRatio: 0.17, bg: BG }), path.join(ROOT, 'assets/icon.png'));
  await writePng(await logoOnBg({ size: 1024, padRatio: 0.17, bg: BG }), path.join(ROOT, 'assets/splash-icon.png'));
  await writePng(await logoOnBg({ size: 48, padRatio: 0.1, bg: BG }), path.join(ROOT, 'assets/favicon.png'));

  // --- adaptive icon source assets ---
  await writePng(await solidBg(512), path.join(ROOT, 'assets/android-icon-background.png'));
  await writePng(await logoOnBg({ size: 512, padRatio: 0.17 }), path.join(ROOT, 'assets/android-icon-foreground.png'));
  await writePng(await monochrome({ size: 432, padRatio: 0.2 }), path.join(ROOT, 'assets/android-icon-monochrome.png'));

  // --- assets/android_icons legacy launcher set + notification icons ---
  const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const notifSizes = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
  for (const [density, size] of Object.entries(launcherSizes)) {
    const bg = await solidBg(size);
    const fg = await logoOnBg({ size, padRatio: 0.17 });
    const composed = await sharp(bg).composite([{ input: fg, gravity: 'center' }]).png().toBuffer();
    await writePng(composed, path.join(ROOT, `assets/android_icons/mipmap-${density}/ic_launcher.png`));
  }
  for (const [density, size] of Object.entries(notifSizes)) {
    const mono = await monochrome({ size, padRatio: 0.1 });
    await writePng(mono, path.join(ROOT, `assets/android_icons/drawable-${density}/ic_notification.png`));
  }
  {
    const bg = await solidBg(512);
    const fg = await logoOnBg({ size: 512, padRatio: 0.17 });
    const composed = await sharp(bg).composite([{ input: fg, gravity: 'center' }]).png().toBuffer();
    await writePng(composed, path.join(ROOT, 'assets/android_icons/play_store_512.png'));
  }

  // --- actual compiled native android resources (android/app/src/main/res) ---
  const resRoot = path.join(ROOT, 'android/app/src/main/res');
  if (fs.existsSync(resRoot)) {
    for (const [density, size] of Object.entries(launcherSizes)) {
      const bg = await solidBg(size);
      const fg = await logoOnBg({ size, padRatio: 0.17 });
      const composed = await sharp(bg).composite([{ input: fg, gravity: 'center' }]).png().toBuffer();
      await writeWebp(composed, path.join(resRoot, `mipmap-${density}/ic_launcher.webp`));
      await writeWebp(composed, path.join(resRoot, `mipmap-${density}/ic_launcher_round.webp`));
      await writeWebp(await logoOnBg({ size, padRatio: 0.17 }), path.join(resRoot, `mipmap-${density}/ic_launcher_foreground.webp`));
      await writeWebp(await monochrome({ size, padRatio: 0.2 }), path.join(resRoot, `mipmap-${density}/ic_launcher_monochrome.webp`));
    }
  }

  console.log('done');
})();
