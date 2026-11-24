import { TYPES } from './data.js';
import { el } from './dom.js';
import { FACET_VISIBLE } from './facets.js';

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

// Rows beyond the first few go behind a Show all button, as in a long facet list.
function splitRows(rows, visible, more, toggle, { open, label, noun, total = rows.length }) {
  visible.replaceChildren(...rows.slice(0, FACET_VISIBLE));
  more.replaceChildren(...rows.slice(FACET_VISIBLE));
  const hasMore = rows.length > FACET_VISIBLE;
  more.hidden = !hasMore || !open;
  toggle.hidden = !hasMore;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? `Show fewer ${noun} filters` : `Show all ${total} ${label} filters`;
}

export function createFacetLists({ onDecade }) {
  const $ = (id) => document.getElementById(id);
  const open = { types: false, decades: false };

  function toggle(key, button) {
    button.addEventListener('click', () => {
      open[key] = !open[key];
      renderAgain();
    });
  }
  let last = { facets: null, type: '', from: '', to: '' };
  function renderAgain() {
    render(last);
  }

  function render({ facets, type, from, to }) {
    last = { facets, type, from, to };
    const types =
      facets?.types ?? [...TYPES].slice(0, 12).map(([id, label]) => ({ id, label, count: null }));
    const total = facets ? facets.types.reduce((sum, entry) => sum + entry.count, 0) : null;
    const rows = [
      typeRow({ id: '', label: 'All publications', count: total }, !type),
      ...types.map((entry) => typeRow(entry, entry.id === type)),
    ];
    const hidden = types.slice(FACET_VISIBLE - 1).some((entry) => entry.id === type);
    splitRows(
      rows,
      $('publicationTypeRows'),
      $('morePublicationTypes'),
      $('showPublicationTypes'),
      {
        open: open.types || hidden,
        label: 'Publication type',
        noun: 'type',
        total: types.length,
      },
    );
    const decades = facets?.decades ?? [];
    $('decadeFilter').hidden = !decades.length;
    splitRows(
      decades.map((decade) => {
        const selected = decade.from === from && decade.to === to;
        return el(
          'button',
          {
            type: 'button',
            class: 'facet-option facet-button',
            'aria-pressed': String(selected),
            onclick: () => onDecade(decade, selected),
          },
          el('span', { class: 'facet-name' }, `${decade.from}–${decade.to}`),
          count(decade.count),
        );
      }),
      $('decadeRows'),
      $('moreDecades'),
      $('showDecades'),
      { open: open.decades, label: 'Publication date', noun: 'date', total: decades.length },
    );
    $('facetNote').hidden = !facets;
    $('facetNote').textContent = facets
      ? 'Counts are records Crossref matched on any of your words, so they run higher than the results you will find relevant.'
      : '';
  }

  toggle('types', $('showPublicationTypes'));
  toggle('decades', $('showDecades'));
  return { render };
}
