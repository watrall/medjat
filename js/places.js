import { preservePlaceFocus } from './place-focus.js';
import {
  loadGazetteer,
  placeEvidence,
  primaryName,
  searchNames,
  searchPlaceWorks,
} from './place-data.js';
import { createPlacePublicationRow } from './place-publication-row.js';
import { PAGE_SIZE } from './crossref.js';
import { createPlaceMap } from './place-map.js';
import { createPlaceFinder } from './place-finder.js';
import { createPlaceRecord } from './place-record.js';
import { createInspector } from './inspector.js';
import { createPlaceCollection } from './place-collection.js';
import { BREAKPOINTS } from './breakpoints.js';
import { el, icon, externalLink, helpLink, skeletons, notify } from './dom.js';

export function createPlaces(
  root,
  {
    getSaved,
    onSave,
    onLocation = () => {},
    onSession = () => {},
    getRemoved = () => null,
    onUndo = async () => {},
    initialSession = null,
  },
) {
  let gazetteer,
    map,
    selected = '',
    mode = 'discover',
    active = false,
    generation = 0,
    mountGeneration = 0,
    controller;
  let works = [],
    next = null,
    total = null,
    retrieved = '',
    query = '',
    term = '',
    topic = '',
    loading = false,
    error = '';
  let panels,
    origin = null;
  let searchDraft = { term: '', topic: '' };
  let evidenceStatus = 'all',
    reading = null,
    mapExpanded = null;
  const place = () => gazetteer?.sites.find((site) => site.id === selected);
  function cancel() {
    if (active) reading = capture();
    active = false;
    loading = false;
    generation++;
    mountGeneration++;
    controller?.abort();
    panels?.collection?.cancel();
  }
  function location() {
    return { place: selected, mode, term, topic, status: evidenceStatus };
  }
  function capture() {
    if (!active && (reading || initialSession)) return reading || initialSession;
    return {
      collection: panels?.collection.capture(),
      ...location(),
      searchDraft,
      mapExpanded,
      inspector: panels?.detail.hidden === false ? panels.inspector.capture() : null,
      scrollY: window.scrollY,
    };
  }
  async function restore() {
    const session = initialSession;
    initialSession = null;
    if (session) return apply({ ...session, session }, false);
    return apply({}, true);
  }
  async function show(options = {}) {
    initialSession = null;
    return apply(options, false);
  }
  async function apply(options, restoreReading) {
    const queryChanged =
      ('term' in options && term !== options.term) ||
      ('topic' in options && topic !== options.topic);
    controller?.abort();
    generation++;
    loading = false;
    active = true;
    if (options.mode) mode = options.mode === 'collection' ? 'collection' : 'discover';
    if ('place' in options && selected !== options.place) {
      selected = options.place;
      works = [];
      next = null;
      total = null;
      term = '';
      topic = '';
      searchDraft = { term: '', topic: '' };
    }
    if ('term' in options) term = options.term;
    if ('topic' in options) topic = options.topic;
    if (queryChanged) {
      works = [];
      next = null;
      total = null;
      error = '';
    }
    if ('status' in options) evidenceStatus = options.status;
    searchDraft = options.session?.searchDraft || {
      ...searchDraft,
      ...(options.term !== undefined ? { term, topic } : {}),
    };
    reading = options.session || (restoreReading ? reading : null);
    if (reading?.mapExpanded !== undefined) mapExpanded = reading.mapExpanded;
    origin = options.origin === undefined ? origin : options.origin;
    try {
      gazetteer ||= await loadGazetteer();
      if (!active) return;
      if (!place()) {
        selected = '';
        term = '';
        topic = '';
        searchDraft = { term: '', topic: '' };
      }
      if (place()) {
        const names = new Set(searchNames(place()));
        if (term && !names.has(term)) {
          term = primaryName(place());
          works = [];
          total = null;
          next = null;
          notify(
            'That search name is not in the current place index. Using the primary place name.',
          );
          onLocation(location(), { push: false });
        }
        searchDraft = {
          term: names.has(searchDraft.term) ? searchDraft.term : term || primaryName(place()),
          topic: typeof searchDraft.topic === 'string' ? searchDraft.topic.slice(0, 300) : topic,
        };
      }
      panels?.collection?.cancel();
      map?.destroy();
      map = null;
      build();
      if (options.focus) root.querySelector('h1')?.focus({ preventScroll: true });
      try {
        const current = ++mountGeneration;
        const instance = await createPlaceMap(panels.map, {
          sites: gazetteer.sites,
          isVisible: (id) => mode !== 'collection' || panels.collection.stats(id) > 0,
          getCount: (id) => (mode === 'collection' ? panels.collection.stats(id) : null),
          onSelect: (id) => choose(id),
          onError: () => {
            panels.mapNotice.hidden = false;
            panels.mapNotice.replaceChildren(
              el(
                'p',
                {},
                'Map tiles could not be fully loaded. You can still choose a place and use the publication list.',
              ),
              el(
                'button',
                {
                  class: 'text-button',
                  onclick: () => {
                    panels.mapNotice.hidden = true;
                    map?.retryTiles();
                  },
                },
                'Retry map tiles',
              ),
            );
          },
        });
        if (!active || current !== mountGeneration) {
          instance.destroy();
          return;
        }
        map = instance;
        if (selected) map.select(selected, { focus: true });
      } catch {
        panels.mapNotice.hidden = false;
        panels.mapNotice.textContent =
          'The map could not load. The place finder and Crossref search remain available.';
      }
      if (mode === 'discover' && selected && !works.length) await search();
      if (reading?.inspector?.current?.raw) {
        panels.publications.hidden = true;
        panels.detail.hidden = false;
        panels.inspector.restore(reading.inspector);
      }
      if (reading) window.scrollTo({ top: reading.scrollY || 0 });
    } catch (error) {
      if (active)
        root.replaceChildren(
          el('h1', {}, 'Places'),
          el('p', { role: 'alert' }, error.message),
          el(
            'button',
            { class: 'button', onclick: () => apply(options, restoreReading) },
            'Retry Places',
          ),
        );
    }
  }
  function build() {
    const mapRoot = el('div', {
      id: 'placeMap',
      class: 'places-map',
      role: 'region',
      'aria-label':
        'Map of ancient places in Egypt. Use arrow keys to pan, plus and minus to zoom, or the place finder.',
    });
    const mapNotice = el('p', { class: 'notice', role: 'status', hidden: true });
    const mapToggle = el('button', {
      class: 'text-button places-map-toggle',
      'aria-controls': 'placeMap',
      onclick: () => {
        mapExpanded = !(mapExpanded ?? !selected);
        syncMapPresentation();
        onSession();
      },
    });
    const publications = el('section', {
      id: 'placePublications',
      tabindex: '-1',
      class: 'places-publications',
      'aria-label': 'Place publications',
    });
    const detail = el('aside', {
      class: 'places-inspector',
      'aria-label': 'Place publication details',
      hidden: true,
      tabindex: '-1',
    });
    const resultPane = el('div', { class: 'places-results' }, publications, detail);
    const inspector = createInspector(detail, {
      onChange: onSession,
      savedLabel: 'Remove from collection',
      onPlace: (site, work) =>
        show({ place: site.id, origin: { work, return: () => inspect(work) } }),
      onClose: () => {
        detail.hidden = true;
        publications.hidden = false;
        renderPublications();
        const work = inspector.getCurrentWork();
        const row = [...publications.querySelectorAll('[data-place-work]')].find(
          (row) => row.dataset.placeWork === work?.id,
        );
        (row?.querySelector('.place-publication-title') || publications.querySelector('h2'))?.focus(
          { preventScroll: true },
        );
      },
      onSave: async (work) => {
        await onSave(work);
        inspector.refresh();
        syncUndo();
      },
      isSaved: (id) => getSaved().has(id),
    });
    const collection = createPlaceCollection(publications, {
      sites: gazetteer.sites,
      getSaved,
      onInspect: inspect,
      onRemove: async (work) => {
        await onSave(work);
        syncUndo();
      },
      onChoose: choose,
      onRefresh: () => map?.refresh(),
      initialDraft: reading?.collection,
      onDraft: onSession,
      getStatus: () => evidenceStatus,
      onStatus: (value) => {
        evidenceStatus = value;
        onLocation(location());
      },
    });
    const undo = el('div', { class: 'place-undo', hidden: true });
    const finder = createPlaceFinder({
      sites: gazetteer.sites,
      types: gazetteer.types,
      periods: gazetteer.periods,
      getSelected: () => selected,
      getMode: () => mode,
      getSavedCount: (id) => panels.collection.stats(id),
      onChoose: choose,
    });
    panels = {
      undo,
      finder,
      map: mapRoot,
      mapNotice,
      mapToggle,
      publications,
      detail,
      inspector,
      collection,
    };
    root.replaceChildren(
      el(
        'div',
        { class: 'places-heading' },
        el(
          'div',
          {},
          el('h1', { tabindex: '-1' }, 'Places'),
          el('p', {}, 'Explore scholarship by ancient place.'),
        ),
        externalLink(['Pleiades gazetteer', icon('external-link')], 'https://pleiades.stoa.org/', {
          class: 'text-button',
        }),
      ),
      el(
        'p',
        { class: 'places-caveat', role: 'note' },
        'Crossref has no place metadata. Places searches for a place\u2019s names and checks each title and abstract for them, so a match is a suggestion, not proof that the work concerns the place. Work that never names the place will not appear.',
        ' ',
        helpLink('limits:places'),
      ),
      el(
        'div',
        { class: 'places-modes', 'aria-label': 'Places research scope' },
        ...[
          ['discover', 'Discover in Crossref'],
          ['collection', 'Your collection'],
        ].map(([value, label]) =>
          el(
            'button',
            {
              class: 'inspector-tab',
              'data-places-mode': value,
              'aria-pressed': String(mode === value),
              onclick: () => switchMode(value),
            },
            label,
          ),
        ),
      ),
      undo,
      el(
        'div',
        { class: 'places-layout' },
        el(
          'section',
          { class: 'places-geography', 'aria-label': 'Choose a place' },
          finder.element,
          el(
            'div',
            { class: 'places-map-tools' },
            mapToggle,
            el(
              'button',
              { class: 'button', onclick: () => map?.overview() },
              icon('expand'),
              'Fit map',
            ),
            el(
              'a',
              {
                href: '#placePublications',
                class: 'text-button places-jump',
                onclick: () => {
                  detail.hidden = true;
                  publications.hidden = false;
                  renderPublications();
                },
              },
              icon('book-open'),
              'View publications',
            ),
          ),
          mapNotice,
          mapRoot,
          el(
            'p',
            { class: 'scope-note' },
            'Numbers group nearby places, not publications. Pin names come from Pleiades; the base map labels places in each region\u2019s local language.',
          ),
          el(
            'details',
            { class: 'places-source' },
            el(
              'summary',
              {},
              `${gazetteer.sites.length.toLocaleString()} places in Egypt · sources and coverage`,
            ),
            el(
              'p',
              {},
              'Fit map changes the camera only. Select a place to change publication scope. Places are those Pleiades describes as a settlement, temple, cemetery, tomb, fort, church, quarry or similar inside Egypt\u2019s present borders, so Nubia and the Levant are not included. Pleiades documents Roman and Late Antique Egypt in far more detail than Pharaonic Egypt, so a missing place says nothing about its importance. Points are not site boundaries. Place names and locations come from Pleiades; publication metadata comes from Crossref.',
            ),
            el(
              'p',
              {},
              `${gazetteer.attribution}. Retrieved ${gazetteer.retrievedAt}. `,
              externalLink(gazetteer.license, gazetteer.licenseURL),
            ),
          ),
        ),
        resultPane,
      ),
    );
    if (origin)
      root.prepend(
        el(
          'button',
          { class: 'text-button place-return', onclick: () => origin.return() },
          icon('arrow-left'),
          origin.label || 'Back to publication',
        ),
      );
    renderPublications();
    finder.sync();
    syncUndo();
    syncMapPresentation();
  }
  function syncMapPresentation() {
    const expanded = mapExpanded ?? !selected;
    root.dataset.mapExpanded = String(expanded);
    panels.mapToggle.setAttribute('aria-expanded', String(expanded));
    panels.mapToggle.replaceChildren(
      icon(expanded ? 'minus' : 'expand'),
      expanded ? 'Compact map' : 'Expand map',
    );
    map?.resize();
  }
  function syncUndo() {
    const entry = getRemoved();
    panels.undo.hidden = !entry;
    panels.undo.replaceChildren(
      ...(entry
        ? [
            el('p', { role: 'status' }, `Removed “${entry.work.title}”.`),
            el(
              'button',
              {
                class: 'text-button',
                onclick: async (event) => {
                  event.currentTarget.disabled = true;
                  try {
                    await onUndo();
                    panels.publications.querySelector('h2')?.focus({ preventScroll: true });
                  } finally {
                    syncUndo();
                  }
                },
              },
              'Undo removal',
            ),
          ]
        : []),
    );
  }
  function switchMode(value) {
    controller?.abort();
    generation++;
    loading = false;
    if (value !== 'collection') panels.collection.cancel();
    mode = value;
    for (const button of root.querySelectorAll('[data-places-mode]'))
      button.setAttribute('aria-pressed', String(button.dataset.placesMode === mode));
    panels.detail.hidden = true;
    panels.publications.hidden = false;
    renderPublications();
    panels.finder.sync();
    map?.refresh();
    onLocation(location());
    if (mode === 'discover' && selected && !works.length) search();
  }
  function choose(id) {
    controller?.abort();
    generation++;
    selected = gazetteer.sites.some((site) => site.id === id) ? id : '';
    works = [];
    next = null;
    total = null;
    error = '';
    retrieved = '';
    topic = '';
    term = place() ? primaryName(place()) : '';
    searchDraft = { term, topic: '' };
    panels.finder.select();
    syncMapPresentation();
    panels.detail.hidden = true;
    panels.publications.hidden = false;
    map?.select(selected, { focus: true });
    onLocation(location());
    renderPublications();
    if (selected && mode === 'discover') search();
  }
  async function search(append = false) {
    if (!place()) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal,
      current = ++generation;
    loading = true;
    error = '';
    renderPublications();
    try {
      const result = await searchPlaceWorks(place(), {
        term: term || primaryName(place()),
        topic,
        cursor: append ? next : '*',
        signal,
      });
      if (!active || current !== generation) return;
      const existing = new Map((append ? works : []).map((work) => [work.id, work]));
      for (const work of result.works) existing.set(work.id, work);
      works = [...existing.values()];
      next = result.next;
      total = result.total;
      query = result.query;
      retrieved = result.retrievedAt;
    } catch (failure) {
      if (!signal.aborted && current === generation) error = failure.message;
    } finally {
      if (current === generation && active) {
        loading = false;
        renderPublications();
      }
    }
  }
  function inspect(work) {
    panels.publications.hidden = true;
    panels.detail.hidden = false;
    panels.inspector.show(work);
    panels.detail.querySelector('.detail-title')?.focus({ preventScroll: true });
    if (matchMedia(BREAKPOINTS.placesMobile).matches)
      panels.detail.scrollIntoView({ block: 'start' });
  }
  function renderPublications() {
    if (!panels) return;
    const restore = preservePlaceFocus(panels.publications);
    renderPublicationContent();
    restore();
  }
  function renderPublicationContent() {
    if (mode === 'collection') {
      panels.collection.render(selected);
      panels.finder.sync();
      map?.refresh();
      return;
    }
    const root = panels.publications,
      current = place();
    if (!current) {
      root.replaceChildren(
        el('h2', { tabindex: '-1' }, 'Start with a place'),
        el(
          'p',
          {},
          'Search for a place, choose a featured place, or select a site on the map. You can use Places before saving anything to your collection.',
        ),
      );
      return;
    }
    const renderPublicationRow = (work) =>
      createPlacePublicationRow(work, {
        place: current,
        isSaved: (id) => getSaved().has(id),
        onInspect: inspect,
        onSave,
        onSync: syncUndo,
      });
    const aliases = searchNames(current);
    const defaultName = primaryName(current);
    const refinementOpen =
      root.querySelector('.place-search-refinements')?.open ??
      !matchMedia(BREAKPOINTS.placesMobile).matches;
    const refinementSummary = el('summary');
    function draftStatus() {
      const pending =
        (searchDraft.term || term || defaultName) !== (term || defaultName) ||
        searchDraft.topic.trim() !== topic;
      refinementSummary.textContent = `Refine place search${pending ? ' · unapplied changes' : ''}`;
    }
    draftStatus();
    const name = el(
      'select',
      {
        id: 'placeSearchName',
        onchange: (event) => {
          searchDraft.term = event.target.value;
          draftStatus();
          onSession();
        },
      },
      aliases.map((alias) =>
        el(
          'option',
          { value: alias, selected: alias === (searchDraft.term || term || defaultName) },
          alias,
        ),
      ),
    );
    const topicInput = el('input', {
      id: 'placeTopic',
      type: 'search',
      maxlength: 300,
      value: searchDraft.topic,
      oninput: (event) => {
        searchDraft.topic = event.target.value;
        draftStatus();
        onSession();
      },
      placeholder: 'e.g. burial, ceramics, settlement',
    });
    root.replaceChildren(
      el('h2', { tabindex: '-1' }, current.name),
      el(
        'p',
        { class: 'scope-note' },
        externalLink('Place identity and names', current.source),
        ` · ${current.latitude.toFixed(3)}°N, ${current.longitude.toFixed(3)}°E`,
      ),
      createPlaceRecord(current, {
        open:
          root.querySelector('.place-record')?.open ??
          !matchMedia(BREAKPOINTS.placesMobile).matches,
      }),
      el(
        'details',
        { class: 'place-search-refinements', open: refinementOpen },
        refinementSummary,
        el(
          'form',
          {
            class: 'place-search-form',
            onsubmit: (event) => {
              event.preventDefault();
              term = name.value;
              topic = topicInput.value.trim();
              works = [];
              next = null;
              onLocation(location());
              search();
            },
          },
          el('label', { for: 'placeSearchName' }, 'Place name in Crossref', name),
          el('label', { for: 'placeTopic' }, 'Topic for this place (optional)', topicInput),
          el(
            'button',
            { class: 'button button-primary', type: 'submit', disabled: loading },
            icon('search'),
            'Search this place',
          ),
        ),
      ),
      el(
        'p',
        { class: 'scope-note' },
        `Applied search: ${term || defaultName} · ${topic || 'Any topic'}`,
      ),
      el(
        'details',
        { class: 'places-source' },
        el('summary', {}, 'How place discovery works'),
        el(
          'p',
          {},
          'Search names come from reviewed Pleiades variants and can refer to different periods or locations.',
        ),
      ),
    );
    if (origin?.work) {
      const evidence = placeEvidence(origin.work, current);
      root.insertBefore(
        el(
          'details',
          { class: 'place-origin' },
          el('summary', {}, 'From your publication'),
          el(
            'button',
            { class: 'place-publication-title', onclick: () => inspect(origin.work) },
            origin.work.title,
          ),
          el(
            'p',
            { class: 'scope-note' },
            evidence
              ? `“${evidence.alias}” appears in the ${evidence.field}.`
              : 'This publication has no recognized mention of the selected place.',
          ),
          evidence && el('blockquote', {}, evidence.text),
        ),
        root.querySelector('.place-search-refinements'),
      );
    }
    if (loading)
      root.append(
        el('p', { role: 'status' }, 'Searching Crossref…'),
        el('ol', { class: 'place-publications', 'aria-busy': 'true' }, skeletons(3)),
      );
    if (error)
      root.append(
        el(
          'div',
          { class: 'notice notice-error', role: 'alert' },
          el('p', {}, error),
          el('button', { class: 'button', onclick: () => search() }, 'Retry Crossref search'),
        ),
      );
    if (!loading && total !== null) {
      const explicit = works.filter((work) => placeEvidence(work, current)),
        other = works.filter((work) => !placeEvidence(work, current));
      root.append(
        el(
          'p',
          { role: 'status', class: 'place-results-status' },
          `${works.length} ${works.length === 1 ? 'candidate' : 'candidates'} loaded · ${explicit.length} with a place-name mention`,
        ),
        el(
          'details',
          { class: 'places-source' },
          el('summary', {}, 'Search scope and retrieval'),
          el(
            'p',
            {},
            `Crossref keywords: ${query}. ${total.toLocaleString()} broad query candidates, retrieved ${new Date(retrieved).toLocaleString()}. This total is not a count of scholarship verified to concern ${current.name}.`,
          ),
        ),
        explicit.length
          ? el('ol', { class: 'place-publications' }, explicit.map(renderPublicationRow))
          : el(
              'p',
              {},
              'No loaded candidate explicitly mentions a recognized place name. Try another search name or look at the other candidates.',
            ),
      );
      if (other.length > 0)
        root.append(
          el(
            'details',
            { class: 'other-place-candidates' },
            el('summary', {}, `Other Crossref candidates (${other.length})`),
            el(
              'p',
              { class: 'scope-note' },
              'These records have no recognized mention in the title or supplied abstract. Check them before associating them with this place.',
            ),
            el('ol', { class: 'place-publications' }, other.map(renderPublicationRow)),
          ),
        );
      if (next)
        root.append(
          el(
            'button',
            { class: 'button', onclick: () => search(true) },
            `Load ${PAGE_SIZE} more candidates`,
          ),
        );
    }
  }
  return {
    show,
    restore,
    capture,
    clearOrigin: () => {
      origin = null;
    },
    cancel,
    location,
    refresh: () => {
      if (active) {
        renderPublications();
        panels.inspector.refresh();
        syncUndo();
      }
    },
  };
}
