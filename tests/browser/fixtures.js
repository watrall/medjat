const pleiades = {
  description: 'An ancient Egyptian city and the burial place of its first kings.',
  placeTypes: ['settlement', 'cemetery'],
  locations: [
    { start: -4500, end: 1999 },
    { start: -3000, end: 640 },
  ],
  names: [{ romanized: 'Abydos' }, { romanized: 'Ebot' }],
  connections: [{}],
  creators: [{ name: 'M. Drew Bear' }, { name: 'R. Talbert' }],
};
export async function blockTiles(page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://pleiades.stoa.org/**', (route) => route.fulfill({ json: pleiades }));
}
