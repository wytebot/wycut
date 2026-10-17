import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const required = [
  'public/manifest.webmanifest', 'public/sw.js', 'public/offline.html',
  'public/favicon.ico', 'public/apple-touch-icon.png',
  'public/icons/icon-192x192.png', 'public/icons/icon-512x512.png',
  'public/icons/icon-maskable-192.png', 'public/icons/icon-maskable-512.png',
  'components/pwa-register.tsx'
];
for (const file of required) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing required PWA file: ${file}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'WyCut — Movie Recap Studio');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.start_url && manifest.scope);
assert.ok(manifest.icons.length >= 8, 'Manifest should include a full icon set');
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.join(root, 'public', icon.src.replace(/^\//, ''))), `Manifest icon missing: ${icon.src}`);
}
const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');
assert.match(layout, /manifest:\s*'\/manifest\.webmanifest'/);
assert.match(layout, /PWARegister/);
const worker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
assert.match(worker, /NEVER_CACHE/);
assert.match(worker, /offline\.html/);
console.log(`PWA audit passed: ${required.length} required files, ${manifest.icons.length} manifest icons, registration and privacy-safe caching rules.`);
