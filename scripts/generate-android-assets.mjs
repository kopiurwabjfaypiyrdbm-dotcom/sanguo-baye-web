import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'app-icon.svg');
const resources = path.join(root, 'android', 'app', 'src', 'main', 'res');

await access(resources);

const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

await Promise.all(Object.entries(densities).flatMap(([density, size]) => {
  const directory = path.join(resources, `mipmap-${density}`);
  const foregroundSize = Math.round(size * 2.25);
  return [
    renderIcon(path.join(directory, 'ic_launcher.png'), size, false),
    renderIcon(path.join(directory, 'ic_launcher_round.png'), size, true),
    renderAdaptiveForeground(path.join(directory, 'ic_launcher_foreground.png'), foregroundSize),
  ];
}));

const splashFiles = await findNamedFiles(resources, 'splash.png');
await Promise.all(splashFiles.map(renderSplash));

console.log(`Generated Android launcher icons and ${splashFiles.length} splash images.`);

async function renderIcon(output, size, round) {
  const icon = await sharp(source).resize(size, size).png().toBuffer();
  if (!round) return sharp({ create: { width: size, height: size, channels: 4, background: '#101b19' } })
    .composite([{ input: icon }]).png().toFile(output);
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
  return sharp(icon).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(output);
}

async function renderAdaptiveForeground(output, size) {
  const inset = Math.round(size * 0.17);
  const icon = await sharp(source).resize(size - inset * 2, size - inset * 2).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: icon, left: inset, top: inset }]).png().toFile(output);
}

async function renderSplash(output) {
  const { width = 1280, height = 720 } = await sharp(output).metadata();
  const iconSize = Math.max(96, Math.round(Math.min(width, height) * 0.28));
  const icon = await sharp(source).resize(iconSize, iconSize).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: '#101b19' } })
    .composite([{
      input: icon,
      left: Math.round((width - iconSize) / 2),
      top: Math.round((height - iconSize) / 2),
    }])
    .png()
    .toFile(output);
}

async function findNamedFiles(directory, fileName) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) return findNamedFiles(location, fileName);
    return entry.name === fileName ? [location] : [];
  }));
  return files.flat();
}
