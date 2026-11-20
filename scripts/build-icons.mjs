import { readFile, writeFile, mkdir } from 'node:fs/promises';
const names = [
  'search',
  'x',
  'map-pin',
  'expand',
  'plus',
  'minus',
  'refresh-cw',
  'bookmark',
  'bookmark-check',
  'library-big',
  'download',
  'external-link',
  'book-open',
  'file-text',
  'user-round',
  'network',
  'copy',
  'info',
  'circle-alert',
  'arrow-left',
];
const symbols = await Promise.all(
  names.map(async (name) => {
    const svg = await readFile(
      new URL(`../node_modules/lucide-static/icons/${name}.svg`, import.meta.url),
      'utf8',
    );
    const content = svg.match(/<svg[\s\S]*?>([\s\S]*?)<\/svg>/)[1];
    return `<symbol id="${name}" viewBox="0 0 24 24">${content}</symbol>`;
  }),
);
await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../assets/icons.svg', import.meta.url),
  `<!-- Lucide icons, ISC License. See LUCIDE-LICENSE. -->\n<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('\n')}</svg>\n`,
);
await writeFile(
  new URL('../assets/LUCIDE-LICENSE', import.meta.url),
  await readFile(new URL('../node_modules/lucide-static/LICENSE', import.meta.url)),
);
console.log(`Built ${names.length} Lucide icons.`);
