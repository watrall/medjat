import { cp, mkdir } from 'node:fs/promises';
const destination = new URL('../assets/vendor/leaflet/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['leaflet-src.esm.js', 'leaflet.css', 'images'])
  await cp(
    new URL(`../node_modules/leaflet/dist/${name}`, import.meta.url),
    new URL(name, destination),
    { recursive: true },
  );
await cp(
  new URL('../node_modules/leaflet/LICENSE', import.meta.url),
  new URL('LICENSE', destination),
);
console.log('Vendored Leaflet 1.9.4 for static hosting.');
