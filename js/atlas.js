import { el, externalLink, notify } from './dom.js';
import { researchData, reviewDecision } from './research-store.js';
export function placeEvidence(work, place) {
  const text = `${work.title}\n${work.abstract || ''}`;
  for (const alias of [place.name, ...place.aliases].filter((name) => name.length >= 4)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'iu').exec(text);
    if (match) return text.slice(Math.max(0, match.index - 70), match.index + alias.length + 110);
  }
  return null;
}
export function createAtlas(root, { getWorks, onInspect }) {
  let gazetteer,
    site = '',
    mode = 'all';
  async function show() {
    root.replaceChildren(
      el('h2', {}, 'Ancient Egypt research atlas'),
      el('p', { role: 'status' }, 'Loading the attributed place gazetteer…'),
    );
    try {
      gazetteer ||= await (await fetch(new URL('../data/sites.json', import.meta.url))).json();
      render();
    } catch {
      root.append(
        el('p', { role: 'alert' }, 'The local gazetteer could not be loaded.'),
        el('button', { class: 'button', onclick: show }, 'Retry atlas'),
      );
    }
  }
  function render() {
    const works = getWorks(),
      decisions = researchData(),
      links = [];
    for (const work of works)
      for (const place of gazetteer.sites) {
        const evidence = placeEvidence(work, place);
        if (evidence) {
          const key = `place:${work.id}:${place.id}`,
            status = decisions[key]?.decision || 'suggested';
          links.push({ work, place, evidence, key, status });
        }
      }
    const located = new Set(
      links.filter((link) => link.status !== 'rejected').map((link) => link.work.id),
    );
    const select = el(
      'select',
      {
        id: 'atlasSite',
        onchange: (event) => {
          site = event.target.value;
          render();
        },
      },
      el('option', { value: '' }, 'All 25 sites'),
      gazetteer.sites.map((place) =>
        el('option', { value: place.id, selected: site === place.id }, place.name),
      ),
    );
    const review = el(
      'select',
      {
        id: 'atlasMode',
        onchange: (event) => {
          mode = event.target.value;
          render();
        },
      },
      ['all', 'suggested', 'confirmed', 'rejected'].map((value) =>
        el(
          'option',
          { value, selected: mode === value },
          value === 'all' ? 'Suggested and confirmed' : value[0].toUpperCase() + value.slice(1),
        ),
      ),
    );
    const visible = links.filter(
      (link) =>
        (!site || site === link.place.id) &&
        (mode === 'all' ? link.status !== 'rejected' : mode === link.status),
    );
    root.replaceChildren(
      el('h2', {}, 'Ancient Egypt research atlas'),
      el(
        'p',
        { class: 'analysis-intro' },
        `Place evidence in ${works.length} saved publications. ${works.length - located.size} have no active place association.`,
      ),
      el(
        'p',
        {},
        'This is a reviewed research-set map, not a geographical summary of the whole Crossref search. Name matches are suggestions: they can refer to other places or historical contexts.',
      ),
      el(
        'div',
        { class: 'analysis-actions' },
        el('label', { for: 'atlasSite' }, 'Place', select),
        el('label', { for: 'atlasMode' }, 'Association status', review),
        el('button', { class: 'button', onclick: render }, 'Refresh saved publications'),
      ),
    );
    const ns = 'http://www.w3.org/2000/svg',
      svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 660 560');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Representative Pleiades site coordinates in Egypt, plotted by longitude and latitude. Use the place selector and evidence list to review associations.',
    );
    const shape = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text) node.textContent = text;
      svg.append(node);
    };
    for (let lat = 24; lat <= 32; lat += 2) {
      const y = 510 - (lat - 23) * 48;
      shape('line', { x1: 50, x2: 620, y1: y, y2: y, stroke: 'var(--color-line)' });
      shape(
        'text',
        { x: 5, y: y + 5, fill: 'var(--color-secondary)', 'font-size': 13 },
        `${lat}°N`,
      );
    }
    for (let lon = 26; lon <= 36; lon += 2) {
      const x = 50 + (lon - 25) * 50;
      shape('line', { x1: x, x2: x, y1: 30, y2: 510, stroke: 'var(--color-line)' });
      shape(
        'text',
        { x: x - 15, y: 540, fill: 'var(--color-secondary)', 'font-size': 13 },
        `${lon}°E`,
      );
    }
    for (const place of gazetteer.sites) {
      const active = visible.some((link) => link.place.id === place.id);
      const x = 50 + (place.longitude - 25) * 50,
        y = 510 - (place.latitude - 23) * 48;
      shape('circle', {
        cx: x,
        cy: y,
        r: site === place.id ? 9 : 5,
        fill: active ? 'var(--color-accent)' : 'var(--color-control)',
      });
      if (site === place.id)
        shape(
          'text',
          { x: x + 12, y: y - 10, fill: 'var(--color-ink)', 'font-size': 15 },
          place.name,
        );
    }
    root.append(
      el('div', { class: 'atlas-map' }, svg),
      el(
        'p',
        { class: 'scope-note' },
        'Coordinate plot, not a political boundary map. Points represent gazetteer locations, not excavation extents. Red points have evidence under the current controls.',
      ),
      el(
        'p',
        {},
        `${gazetteer.attribution}. `,
        externalLink('Pleiades source and downloads', 'https://pleiades.stoa.org/downloads'),
        ' · ',
        externalLink(gazetteer.license, gazetteer.licenseURL),
        ` · Retrieved ${gazetteer.retrievedAt}.`,
      ),
    );
    const list = el('ol', { class: 'review-list' });
    for (const link of visible)
      list.append(
        el(
          'li',
          {},
          el('h3', {}, link.place.name),
          el('p', {}, link.work.title),
          el('blockquote', {}, link.evidence),
          el(
            'p',
            { class: 'scope-note' },
            `Association: ${link.status}. Representative point: ${link.place.latitude.toFixed(3)}°N, ${link.place.longitude.toFixed(3)}°E. `,
            externalLink('Gazetteer record', link.place.source),
          ),
          el(
            'button',
            { class: 'text-button', onclick: () => onInspect(link.work) },
            'Inspect publication',
          ),
          ...['confirmed', 'rejected', 'suggested'].map((decision) =>
            el(
              'button',
              {
                class: 'text-button',
                onclick: () => {
                  if (
                    !reviewDecision(link.key, {
                      decision,
                      doi: link.work.id,
                      place: link.place.id,
                      evidence: link.evidence,
                      source: link.place.source,
                    })
                  )
                    notify('Place review kept for this visit only. Export a backup.');
                  render();
                },
              },
              decision === 'confirmed'
                ? 'Confirm association'
                : decision === 'rejected'
                  ? 'Reject association'
                  : 'Reset to suggested',
            ),
          ),
        ),
      );
    root.append(
      el('h3', {}, `Publication-place evidence (${visible.length})`),
      visible.length
        ? list
        : el(
            'p',
            {},
            'No associations under these controls. Save relevant publications in Collection or change the place/status selection.',
          ),
      el(
        'details',
        {},
        el('summary', {}, 'Publications without an active association'),
        el(
          'ul',
          {},
          works
            .filter((work) => !located.has(work.id))
            .map((work) =>
              el(
                'li',
                {},
                el('button', { class: 'text-button', onclick: () => onInspect(work) }, work.title),
              ),
            ),
        ),
      ),
    );
  }
  return { show };
}
