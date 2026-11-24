import { BREAKPOINTS } from './breakpoints.js';
import { el, icon } from './dom.js';
import { searchPlaces } from './place-search.js';

const STEP = 20;

function filter(id, label, options, onchange) {
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
      filter('placeType', 'Type', { '': 'Any type', ...types }, reset('type')),
      filter('placePeriod', 'Period', { '': 'Any period', ...periods }, reset('period')),
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
  const element = el(
    'section',
    { class: 'place-finder', 'aria-label': 'Find a place' },
    toggle,
    body,
  );
  function present() {
    const place = sites.find((site) => site.id === getSelected());
    element.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.replaceChildren(
      icon('search'),
      place ? `Change place (now ${place.name})` : 'Find a place',
    );
  }

  function choice(place, meta) {
    return el(
      'li',
      {},
      el(
        'button',
        {
          class: 'place-choice',
          type: 'button',
          'data-place-id': place?.id ?? '',
          'aria-pressed': String((place?.id ?? '') === getSelected()),
          onclick: () => onChoose(place?.id ?? ''),
        },
        el('span', { class: 'place-choice-name' }, place ? place.name : 'All places'),
        meta && el('span', { class: 'place-choice-meta' }, meta),
      ),
    );
  }

  function describe(place) {
    if (getMode() === 'collection') {
      const count = getSavedCount(place.id);
      return `${count} saved`;
    }
    const span =
      place.periods?.length > 2 ? [place.periods[0], place.periods.at(-1)] : place.periods;
    return [
      types[place.types[0]],
      span
        ?.map((period) => periods[period])
        .join(span.length > 1 && place.periods.length > 2 ? ' to ' : ' and '),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function update() {
    const collection = getMode() === 'collection';
    const searching = Boolean(state.query.trim() || state.type || state.period);
    const saved = collection ? sites.filter((place) => getSavedCount(place.id) > 0) : [];
    const found = searching
      ? searchPlaces(sites, state)
      : collection
        ? searchPlaces(saved, {})
        : searchPlaces(sites, {}).filter((place) => place.featured);
    const shown = found.slice(0, searching || collection ? state.limit : found.length);
    const focused = document.activeElement?.closest?.('.place-finder-results')
      ? document.activeElement.dataset.placeId
      : null;
    list.dataset.layout = searching || collection ? 'rows' : 'chips';
    list.replaceChildren(
      ...(collection ? [choice(null)] : []),
      ...shown.map((place) => choice(place, searching || collection ? describe(place) : '')),
    );
    if (focused !== null) list.querySelector(`[data-place-id="${CSS.escape(focused)}"]`)?.focus();
    if (collection && !searching)
      status.textContent = saved.length
        ? `${saved.length} ${saved.length === 1 ? 'place has' : 'places have'} saved publications. Search to choose another place.`
        : 'None of your saved publications mentions a recognised place yet. Search to choose a place.';
    else if (!searching)
      status.textContent = `Featured places. Search to find any of ${sites.length.toLocaleString()} places in Egypt.`;
    else if (!found.length)
      status.textContent = 'No place matches. Try another spelling or remove a filter.';
    else
      status.textContent = `${found.length.toLocaleString()} ${found.length === 1 ? 'place matches' : 'places match'}${found.length > shown.length ? `; showing ${shown.length}` : ''}.`;
    more.hidden = found.length <= shown.length;
    more.textContent = `Show ${Math.min(STEP, found.length - shown.length)} more places`;
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
