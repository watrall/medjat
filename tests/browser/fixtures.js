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
// Keeps place tests off the network: no map tiles, and a fixed Pleiades record for any place.
export async function stubPlaceServices(page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://pleiades.stoa.org/**', (route) => route.fulfill({ json: pleiades }));
}
export async function choosePlace(page, id) {
  await page.locator(`[data-place-id="${id}"]`).first().click();
}
// Keeps citation lookups off the network: OpenCitations knows of no citations.
export async function stubCitations(page) {
  await page.route('https://api.opencitations.net/**', (route) => route.fulfill({ json: [] }));
}
