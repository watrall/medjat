import { PERIODS } from './data.js';
import { el, icon } from './dom.js';

export const TILES_PER_VISIT = 6;
const STORAGE_KEY = 'medjat-landing-tiles';
const SIZES = '(min-width: 1600px) 520px, (min-width: 1024px) 33vw, (min-width: 560px) 50vw, 100vw';

const CC = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

// The title is the exact search a tile runs, so each one was tried against Crossref first.
// Groups are never shown; they only keep one visit from drawing six tiles of the same kind.
export const LANDING_TILES = [
  {
    id: 'hierakonpolis',
    group: 'sites',
    title: 'Hierakonpolis: The City of the Hawk',
    period: 'predynastic',
    image: 'hierakonpolis',
    credit: {
      text: 'Falcon on a Predynastic jar, British Museum EA 36328. Photograph by Anthony Huan',
      url: 'https://commons.wikimedia.org/wiki/File:Falcon_Horus,_deity_of_Hierakonpolis,_on_a_Naqada_IIC_jar,_British_Museum_EA_36328.jpg',
      license: 'CC BY-SA 2.0',
    },
  },
  {
    id: 'ostraca',
    group: 'texts',
    title: 'Deir el-Medina ostraca',
    period: 'new-kingdom',
    image: 'ostraca',
    credit: {
      text: 'Limestone ostracon of Amennakht, Ashmolean Museum HO 25. Photograph by Zunkir',
      url: 'https://commons.wikimedia.org/wiki/File:Limestone_ostrakon_Amennakht_HO_25.jpg',
      license: 'CC BY-SA 4.0',
    },
  },
  {
    id: 'amarna',
    group: 'texts',
    title: 'Amarna boundary stelae',
    period: 'new-kingdom',
    image: 'amarna',
    credit: {
      text: 'Western boundary stela at Amarna. Photograph by Orell Witthuhn',
      url: 'https://commons.wikimedia.org/wiki/File:Amarna-Grenzstele.jpg',
      license: 'CC BY-SA 4.0',
    },
  },
  {
    id: 'coffins',
    group: 'objects',
    title: 'Reuse of Egyptian coffins',
    image: 'coffins',
    credit: {
      text: 'Outer coffin of Menkheperre, reused from Ahmose. Gustavo Camps, The Metropolitan Museum of Art',
      url: 'https://commons.wikimedia.org/wiki/File:Outer_Coffin_of_Menkheperre_(C),_usurped_from_Ahmose_MET_LC-25_3_7a_b_EGDP030187.jpg',
      license: 'CC0',
    },
  },
  {
    id: 'blue',
    group: 'objects',
    title: 'Egyptian blue pigment analysis',
    image: 'blue',
    credit: {
      text: 'Egyptian blue in a wall painting from the tomb of Amun-her-Khepeshef, Medinet Habu. Figure 3, left, in Luigi Fabbrizzi (2025)',
      url: 'https://link.springer.com/article/10.1007/s40828-025-00204-8/figures/3',
      license: 'CC BY 4.0',
    },
  },
  {
    id: 'dating',
    group: 'science',
    title: 'Radiocarbon dating of Predynastic Egypt',
    period: 'predynastic',
    image: 'naqada-jar',
    credit: {
      text: 'Naqada II decorated jar with two boats, The Metropolitan Museum of Art',
      url: 'https://www.metmuseum.org/art/collection/search/558192',
      license: 'Public domain',
    },
  },
];

export const tileById = (id) => LANDING_TILES.find((tile) => tile.id === id);

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// One tile from each group first, so a visit spans kinds of scholarship, then any that remain.
export function pickTiles(pool, { random = Math.random, count = TILES_PER_VISIT } = {}) {
  const groups = new Map();
  for (const tile of shuffle(pool, random)) {
    if (!groups.has(tile.group)) groups.set(tile.group, []);
    groups.get(tile.group).push(tile);
  }
  const chosen = shuffle([...groups.values()], random).map((tiles) => tiles[0]);
  const rest = shuffle(
    [...groups.values()].flatMap((tiles) => tiles.slice(1)),
    random,
  );
  return shuffle([...chosen, ...rest].slice(0, count), random);
}

// A visit keeps its tiles so returning to the landing page does not reshuffle them.
export function chooseTiles({ storage, random = Math.random } = {}) {
  try {
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    const tiles = Array.isArray(stored) ? stored.map(tileById) : [];
    if (
      tiles.length === Math.min(TILES_PER_VISIT, LANDING_TILES.length) &&
      tiles.every(Boolean) &&
      new Set(tiles).size === tiles.length
    )
      return tiles;
  } catch {}
  const tiles = pickTiles(LANDING_TILES, { random });
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(tiles.map((tile) => tile.id)));
  } catch {}
  return tiles;
}

const arrowIcon = () => {
  const arrow = icon('arrow-right');
  arrow.classList.add('tile-arrow');
  return arrow;
};

const periodLine = (id) => {
  const period = PERIODS.find((entry) => entry.id === id);
  return period && `${period.name} · ${period.dates}`;
};

export function renderLandingTiles(list, credits, tiles) {
  list.replaceChildren(
    ...tiles.map((tile, index) =>
      el(
        'li',
        {},
        el(
          'a',
          {
            id: `${tile.id}Tile`,
            class: 'research-tile',
            href: `?${new URLSearchParams({ q: tile.title, context: '0' })}`,
          },
          el(
            'span',
            { class: 'tile-media' },
            el('img', {
              class: 'tile-photo',
              src: `assets/landing/${tile.image}.webp`,
              srcset: `assets/landing/${tile.image}-small.webp 560w, assets/landing/${tile.image}.webp 1120w`,
              sizes: SIZES,
              width: 1120,
              height: 700,
              alt: '',
              decoding: 'async',
              loading: index > 2 ? 'lazy' : undefined,
            }),
            el(
              'span',
              { class: 'tile-text' },
              el('span', { class: 'tile-title' }, tile.title),
              tile.period && el('span', { class: 'tile-period' }, periodLine(tile.period)),
            ),
            el('span', { class: 'tile-action' }, 'Search publications', arrowIcon()),
          ),
        ),
      ),
    ),
  );
  credits.replaceChildren(
    ...tiles.map(({ credit }) =>
      el(
        'li',
        {},
        el('a', { href: credit.url }, credit.text),
        ' · ',
        CC[credit.license] ? el('a', { href: CC[credit.license] }, credit.license) : credit.license,
        '. Cropped and resized.',
      ),
    ),
  );
}
