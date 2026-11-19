export async function blockTiles(page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
}
