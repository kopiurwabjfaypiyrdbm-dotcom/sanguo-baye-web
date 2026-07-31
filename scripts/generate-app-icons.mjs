import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'app-icon.svg');
const output = path.join(root, 'public', 'icons');

await mkdir(output, { recursive: true });

await Promise.all([
  sharp(source).resize(192, 192).png().toFile(path.join(output, 'app-icon-192.png')),
  sharp(source).resize(512, 512).png().toFile(path.join(output, 'app-icon-512.png')),
  sharp(source).resize(410, 410).extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: '#101b19',
  }).png().toFile(path.join(output, 'app-icon-maskable-512.png')),
]);

console.log('Generated PWA icons in public/icons.');
