import { TYPES } from './data.js';
import { el, helpLink, icon } from './dom.js';

export const FACET_VISIBLE = 9;
const NOTE =
  'Counts are records Crossref matched on any of your words, so they run higher than the results you will find relevant.';

const count = (value, id) => el('span', { class: 'facet-count', id }, value.toLocaleString());

// The radio is named by the type alone; the count is read as its description.
function typeRow({ id, label, count: total }, selected) {
  const countId = `facet-count-${id || 'all'}`;
  return el(
    'label',
    { class: 'facet-option' },
    el('input', {
      type: 'radio',
      name: 'publicationType',
      value: id,
      checked: selected,
      'aria-label': label,
      'aria-describedby': total !== null ? countId : undefined,
    }),
    el('span', { class: 'facet-name' }, label),
    total !== null && count(total, countId),
  );
}

function pressedRow(label, total, selected, onclick) {
  return el(
    'button',
    {
      type: 'button',
      class: 'facet-option facet-button',
      'aria-pressed': String(selected),
      onclick,
    },
    el('span', { class: 'facet-name' }, label),
    count(total),
  );
}

function splitRows(rows, { visible, more, toggle, open, label, noun, total = rows.length }) {
  visible.replaceChildren(...rows.slice(0, FACET_VISIBLE));
  more.replaceChildren(...rows.slice(FACET_VISIBLE));
  const hasMore = rows.length > FACET_VISIBLE;
  more.hidden = !hasMore || !open;
  toggle.hidden = !hasMore;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? `Show fewer ${noun} filters` : `Show all ${total} ${label} filters`;
}

export function createFacetLists({ onDecade, onAccess }) {
  const $ = (id) => document.getElementById(id);
  const open = { types: false, decades: false };
  let last = { facets: null, type: '', from: '', to: '' };

  function render({ facets, type, from, to }) {
    last = { facets, type, from, to };
    const types =
      facets?.types ?? [...TYPES].slice(0, 12).map(([id, label]) => ({ id, label, count: null }));
    const everything = facets ? facets.types.reduce((sum, entry) => sum + entry.count, 0) : null;
    const rows = [
      typeRow({ id: '', label: 'All publications', count: everything }, !type),
      ...types.map((entry) => typeRow(entry, entry.id === type)),
    ];
    const chosenIsHidden = rows.slice(FACET_VISIBLE).some((row) => row.querySelector(':checked'));
    splitRows(rows, {
      visible: $('publicationTypeRows'),
      more: $('morePublicationTypes'),
      toggle: $('showPublicationTypes'),
      open: open.types || chosenIsHidden,
      label: 'Publication type',
      noun: 'type',
      total: types.length,
    });
    const decades = facets?.decades ?? [];
    $('decadeFilter').hidden = !decades.length;
    splitRows(
      decades.map((decade) => {
        const selected = decade.from === from && decade.to === to;
        return pressedRow(`${decade.from}–${decade.to}`, decade.count, selected, () =>
          onDecade(decade, selected),
        );
      }),
      {
        visible: $('decadeRows'),
        more: $('moreDecades'),
        toggle: $('showDecades'),
        open: open.decades,
        label: 'Publication date',
        noun: 'date',
        total: decades.length,
      },
    );
    $('facetNote').hidden = !facets;
    $('facetNote').replaceChildren(...(facets ? [NOTE, ' ', helpLink('limits:totals')] : []));
  }

  function renderAccess({ loaded, openAccess, selected }) {
    $('accessRows').replaceChildren(
      pressedRow('All records', loaded, !selected, () => onAccess('')),
      pressedRow('Open access', openAccess, selected === 'open', () => onAccess('open')),
    );
  }

  for (const [key, id] of [
    ['types', 'showPublicationTypes'],
    ['decades', 'showDecades'],
  ])
    $(id).addEventListener('click', () => {
      open[key] = !open[key];
      render(last);
    });
  return { render, renderAccess };
}

export function addChevrons(summaries) {
  for (const summary of summaries)
    summary.append(
      ...['down', 'up'].map((way) => {
        const chevron = icon(`chevron-${way}`);
        chevron.classList.add('chevron', `chevron-${way}`);
        return chevron;
      }),
    );
}
