import { PERIODS } from './data.js';
import { el, icon } from './dom.js';

export const TILES_PER_VISIT = 6;
const SIZES = '(min-width: 1600px) 520px, (min-width: 1024px) 33vw, (min-width: 560px) 50vw, 100vw';

const CC = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

// The title is the exact search a tile runs, so each one was tried against Crossref first.
// Groups are never shown; they only keep one visit from drawing six tiles of the same kind.
export const LANDING_TILES = [
  {
    id: 'hierakonpolis',
    group: 'sites',
    title: 'Hierakonpolis and the Predynastic elite cemetery',
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
  {
    id: 'giza',
    group: 'sites',
    title: 'Giza workers town and the pyramid builders',
    period: 'old-kingdom',
    image: 'giza-workmen',
    credit: {
      text: 'Workmen at the Italian excavations in the Giza necropolis, 1903. Schiaparelli mission, Archivio fotografico, Museo Egizio, Turin',
      url: 'https://commons.wikimedia.org/wiki/File:Schiaparelli%27s_excavations_-_Giza,_Landscape_and_unknown_mastabas,_Landscape_and_unknown_areas,_1903,_photo_14_of_22_-_Archivio_fotografico_Museo_Egizio,_Turin_-_CEFB,_Como_F_017.jpg',
      license: 'CC0',
    },
  },
  {
    id: 'abydos',
    group: 'sites',
    title: 'Abydos and the Umm el-Qaab royal cemetery',
    image: 'abydos-stela',
    credit: {
      text: 'Funerary stela of King Semerkhet (JE 318) from Umm el-Qaab, Abydos, Egyptian Museum, Cairo. Photograph by Nate Loper',
      url: 'https://commons.wikimedia.org/wiki/File:Horus_Falcon_and_Serekh_of_King_Semerkhet_%E2%80%94_Funerary_Stela_JE_318_(55578563987)_(cropped).jpg',
      license: 'CC BY 4.0',
    },
  },
  {
    id: 'pyramidtexts',
    group: 'texts',
    title: 'Pyramid Texts of the Old Kingdom',
    period: 'old-kingdom',
    image: 'pyramid-texts',
    credit: {
      text: 'Pyramid Texts in the Pyramid of Unas, Saqqara. Photograph by Aidan McRae Thomson',
      url: 'https://commons.wikimedia.org/wiki/File:Pyramid_Texts_in_Unas%E2%80%99_Pyramid_2017.jpg',
      license: 'CC BY-SA 2.0',
    },
  },
  {
    id: 'mummification',
    group: 'objects',
    title: 'Mummification and embalming',
    image: 'canopic-jar',
    credit: {
      text: "Canopic jar with falcon's head, The Cleveland Museum of Art, 1921.1018",
      url: 'https://commons.wikimedia.org/wiki/File:Clevelandart_1921.1018.jpg',
      license: 'CC0',
    },
  },
  {
    id: 'muon',
    group: 'science',
    title: 'Muon imaging of the Great Pyramid and ScanPyramids',
    image: 'grand-gallery',
    credit: {
      text: 'Looking up the Grand Gallery inside the Great Pyramid. Photograph by Mike McBey',
      url: 'https://commons.wikimedia.org/wiki/File:Looking_upwards,_along_the_Grand_Gallery,_inside_the_Great_Pyramid_1984_(50535456558).jpg',
      license: 'CC BY 2.0',
    },
  },
  {
    id: 'digital',
    group: 'science',
    title: 'Digital epigraphy and documentation of Egyptian temple reliefs',
    image: 'lepsius-relief',
    credit: {
      text: 'Relief in the temple of Derr, recorded by Carl Richard Lepsius for Denkmäler aus Aegypten und Aethiopien (1849–59)',
      url: 'https://commons.wikimedia.org/wiki/File:Derr_(Lepsius)_03.jpg',
      license: 'Public domain',
    },
  },
  {
    id: 'coffinconservation',
    group: 'heritage',
    title: 'Conservation of painted Egyptian coffins and polychrome wood',
    image: 'coffin-panel',
    credit: {
      text: 'Coffin panel with paintings of funerary scenes, 21st Dynasty, The Walters Art Museum',
      url: 'https://commons.wikimedia.org/wiki/File:Egyptian_-_Coffin_Panel_with_Paintings_of_Funerary_Scenes_-_Walters_622_-_Detail_A.jpg',
      license: 'Public domain',
    },
  },
  {
    id: 'papyriconservation',
    group: 'heritage',
    title: 'Conservation of Egyptian papyri and manuscripts',
    image: 'papyrus-fragments',
    credit: {
      text: 'Papyrus fragments from the Book of the Dead of the Scribe Roy, The Metropolitan Museum of Art, 21.2.21b',
      url: 'https://commons.wikimedia.org/wiki/File:Papyrus_fragments_from_the_Book_of_the_Dead_of_the_Scribe_Roy_MET_21.2.21b_EGDP014611.jpg',
      license: 'CC0',
    },
  },
  {
    id: 'antiquities',
    group: 'heritage',
    title: 'Egyptian Antiquities Service and the history of heritage management in Egypt',
    image: 'mariette',
    credit: {
      text: 'Auguste Mariette, c. 1861. Photograph by Nadar, Bibliothèque nationale de France',
      url: 'https://commons.wikimedia.org/wiki/File:Auguste_Mariette_photography.jpg',
      license: 'Public domain',
    },
  },
  {
    id: 'colonialism',
    group: 'history',
    title: 'Egyptology, colonialism and archaeology in Egypt',
    image: 'teynard-dendera',
    credit: {
      text: 'Temple of Hathor at Dendera, rear face: Cleopatra and Caesarion. Plate 25 in Félix Teynard, Égypte et Nubie (1858), Bibliothèque nationale de France',
      url: 'https://commons.wikimedia.org/wiki/File:%C3%89gypte_et_Nubie,_sites_et_monuments..._Atlas_photographi%C3%A9..._servant_de_compl%C3%A9ment_%C3%A0_la_grande_description_de_l%27%C3%89gypte_-_Premi%C3%A8re_partie,_Egypte_-_par_F%C3%A9lix_Teynard..._-_btv1b53218315m_(075_of_200).jpg',
      license: 'Public domain',
    },
  },
  {
    id: 'egyptomania',
    group: 'history',
    title: 'Egyptomania and the reception of ancient Egypt',
    image: 'egyptian-revival',
    credit: {
      text: 'Egyptian-motif Al-Sihah Shrine Temple, Macon, Georgia, 2017. Photograph by Carol M. Highsmith, Library of Congress',
      url: 'https://commons.wikimedia.org/wiki/File:Vacant,_Egyptian-motif_Al-Sihah_Shrine_Temple_in_Macon,_Georgia,_2017.jpg',
      license: 'Public domain',
    },
  },
  {
    id: 'museums',
    group: 'history',
    title: 'Museum exhibitions of ancient Egypt and their audiences',
    image: 'museum-case',
    credit: {
      text: 'Ancient Egypt gallery, Birmingham Museum and Art Gallery: the case Preparing for the Afterlife. Photograph by Notafly',
      url: 'https://commons.wikimedia.org/wiki/File:BirminghamMuseumEgyptPreparingAfterlife.jpg',
      license: 'CC BY-SA 3.0',
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
