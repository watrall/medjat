import { BREAKPOINTS } from './breakpoints.js';
import { el, icon } from './dom.js';
import { searchPlaces } from './place-search.js';

const STEP = 20;

function selectFilter(id, label, options, onchange) {
  return el(
    'label',
    { for: id },
    label,
    el(
      'select',
      { id, onchange: (event) => onchange(event.target.value) },
      ...Object.entries(options).map(([value, text]) => el('option', { value }, text)),
    ),
  );
}

export function createPlaceFinder({
  sites,
  types,
  periods,
  getSelected,
  getMode,
  getSavedCount,
  onChoose,
}) {
  const state = { query: '', type: '', period: '', limit: STEP };
  const input = el('input', {
    id: 'placeSearch',
    type: 'search',
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: 80,
    placeholder: 'Abydos or Medinet Habu',
    oninput: (event) => {
      state.query = event.target.value;
      state.limit = STEP;
      update();
    },
  });
  const status = el('p', { class: 'place-finder-status', role: 'status' });
  const list = el('ul', { class: 'place-finder-results' });
  const more = el('button', {
    class: 'text-button',
    type: 'button',
    onclick: () => {
      state.limit += STEP;
      update();
    },
  });
  const reset = (key) => (value) => {
    state[key] = value;
    state.limit = STEP;
    update();
  };
  const body = el(
    'div',
    { class: 'place-finder-body', id: 'placeFinderBody' },
    el(
      'form',
      {
        class: 'place-finder-form',
        role: 'search',
        'aria-label': 'Find a place',
        onsubmit: (event) => event.preventDefault(),
      },
      el('label', { class: 'place-finder-query', for: 'placeSearch' }, 'Find a place', input),
      selectFilter('placeType', 'Type', { '': 'Any type', ...types }, reset('type')),
      selectFilter('placePeriod', 'Period', { '': 'Any period', ...periods }, reset('period')),
    ),
    status,
    list,
    more,
  );
  const compact = () => matchMedia(BREAKPOINTS.placesMobile).matches;
  let open = !(compact() && getSelected());
  const toggle = el('button', {
    class: 'text-button place-finder-toggle',
    type: 'button',
    'aria-controls': 'placeFinderBody',
    onclick: () => {
      open = !open;
      present();
      if (open) input.focus();
    },
  });
  const element = el('div', { class: 'place-finder' }, toggle, body);
  function present() {
    const place = sites.find((site) => site.id === getSelected());
    element.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.replaceChildren(
      icon('search'),
      place ? `Change place (now ${place.name})` : 'Find a place',
    );
  }

  function choice(id, name, meta) {
    return el(
      'li',
      {},
      el(
        'button',
        {
          class: 'place-choice',
          type: 'button',
          'data-place-id': id,
          'aria-pressed': String(id === getSelected()),
          onclick: () => onChoose(id),
        },
        el('span', { class: 'place-choice-name' }, name),
        meta && el('span', { class: 'place-choice-meta' }, meta),
      ),
    );
  }

  function describe(place) {
    if (getMode() === 'collection') return `${getSavedCount(place.id)} saved`;
    const named = (period) => periods[period];
    const [first, last] = [place.periods?.[0], place.periods?.at(-1)];
    const span =
      place.periods?.length > 2
        ? `${named(first)} to ${named(last)}`
        : place.periods?.map(named).join(' and ');
    return [types[place.types[0]], span].filter(Boolean).join(' · ');
  }

  function statusText({ collection, searching, found, shown, saved }) {
    const count = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
    if (collection && !searching)
      return saved.length
        ? `${count(saved.length, 'place has', 'places have')} saved publications. Search to choose another place.`
        : 'None of your saved publications mentions a recognised place yet. Search to choose a place.';
    if (!searching)
      return `Featured places. Search to find any of ${sites.length.toLocaleString()} places in Egypt.`;
    if (!found.length) return 'No place matches. Try another spelling or remove a filter.';
    const tail = found.length > shown.length ? `; showing ${shown.length}` : '';
    return `${count(found.length, 'place matches', 'places match')}${tail}.`;
  }

  function update() {
    const collection = getMode() === 'collection';
    const searching = Boolean(state.query.trim() || state.type || state.period);
    const saved = collection ? sites.filter((place) => getSavedCount(place.id) > 0) : [];
    const found = searching
      ? searchPlaces(sites, state)
      : searchPlaces(collection ? saved : sites.filter((place) => place.featured));
    const paged = searching || collection;
    const shown = paged ? found.slice(0, state.limit) : found;
    const focused = list.contains(document.activeElement)
      ? document.activeElement.dataset.placeId
      : null;
    list.dataset.layout = paged ? 'rows' : 'chips';
    list.replaceChildren(
      ...(collection ? [choice('', 'All places')] : []),
      ...shown.map((place) => choice(place.id, place.name, paged ? describe(place) : '')),
    );
    if (focused !== null) list.querySelector(`[data-place-id="${CSS.escape(focused)}"]`)?.focus();
    status.textContent = statusText({ collection, searching, found, shown, saved });
    const hadFocus = document.activeElement === more;
    more.hidden = found.length <= shown.length;
    more.textContent = `Show ${Math.min(STEP, found.length - shown.length)} more places`;
    if (hadFocus && more.hidden) list.querySelector('li:last-child .place-choice')?.focus();
  }

  return {
    element,
    sync() {
      present();
      update();
    },
    select() {
      if (compact() && getSelected()) open = false;
      present();
      for (const button of list.querySelectorAll('.place-choice'))
        button.setAttribute('aria-pressed', String(button.dataset.placeId === getSelected()));
    },
  };
}
