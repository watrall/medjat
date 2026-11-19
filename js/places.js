import { preservePlaceFocus } from './place-focus.js';
import { publicationMetadata } from './place-publication.js';
import { loadGazetteer, placeEvidence, searchPlaceWorks } from './place-data.js';
import { PAGE_SIZE } from './crossref.js';
import { createPlaceMap } from './place-map.js';
import { createInspector } from './inspector.js';
import { createPlaceCollection } from './place-collection.js';
import { doiURL } from './data.js';
import { el, icon, externalLink, skeletons, notify } from './dom.js';

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
  async function show(options = {}) {
    if (!Object.keys(options).length && initialSession)
      options = { ...initialSession, session: initialSession };
    initialSession = null;
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
    reading = options.session || (Object.keys(options).length ? null : reading);
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
        const names = new Set([place().name, ...place().aliases]);
        if (term && !names.has(term)) {
          term = place().name;
          works = [];
          total = null;
          next = null;
          notify(
            'That search name is not in the current place index. Using the primary place name.',
          );
          onLocation(location(), { push: false });
        }
        searchDraft = {
          term: names.has(searchDraft.term) ? searchDraft.term : term || place().name,
          topic: typeof searchDraft.topic === 'string' ? searchDraft.topic.slice(0, 300) : topic,
        };
      }
      panels?.collection?.cancel();
      map?.destroy();
      map = null;
      build();
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
          'The map could not load. The place selector and Crossref search remain available.';
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
          el('button', { class: 'button', onclick: () => show(options) }, 'Retry Places'),
        );
    }
  }
  function build() {
    const selector = el(
      'select',
      { id: 'placeSelect', onchange: (event) => choose(event.target.value) },
      el('option', { value: '' }, mode === 'collection' ? 'All places' : 'Choose an ancient place'),
      [...gazetteer.sites]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((site) => el('option', { value: site.id, selected: site.id === selected }, site.name)),
    );
    const mapRoot = el('div', {
      id: 'placeMap',
      class: 'places-map',
      role: 'region',
      'aria-label':
        'Map of ancient places in Egypt. Use arrow keys to pan, plus and minus to zoom, or the place selector.',
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
    panels = {
      undo,
      selector,
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
        el('div', {}, el('h1', {}, 'Places'), el('p', {}, 'Explore scholarship by ancient place.')),
        externalLink(['Pleiades gazetteer', icon('external-link')], 'https://pleiades.stoa.org/', {
          class: 'text-button',
        }),
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
          el(
            'div',
            { class: 'places-map-tools' },
            el('label', { for: 'placeSelect' }, 'Ancient place', selector),
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
          el('p', { class: 'scope-note' }, 'Numbers group nearby places, not publications.'),
          el(
            'details',
            { class: 'places-source' },
            el('summary', {}, `${gazetteer.sites.length} curated places · sources and coverage`),
            el(
              'p',
              {},
              'Fit map changes the camera only. Select a place to change publication scope. This curated index does not cover all ancient Egypt; points are not site boundaries. Place names and locations come from Pleiades; publication metadata comes from Crossref.',
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
          'Back to publication',
        ),
      );
    renderPublications();
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
    panels.selector.options[0].textContent =
      mode === 'collection' ? 'All places' : 'Choose an ancient place';
    for (const button of root.querySelectorAll('[data-places-mode]'))
      button.setAttribute('aria-pressed', String(button.dataset.placesMode === mode));
    panels.detail.hidden = true;
    panels.publications.hidden = false;
    renderPublications();
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
    term = place()?.name || '';
    searchDraft = { term, topic: '' };
    panels.selector.value = selected;
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
        term: term || place().name,
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
    if (matchMedia('(max-width: 899px)').matches) panels.detail.scrollIntoView({ block: 'start' });
  }
  function publicationRow(work) {
    const evidence = placeEvidence(work, place());
    const save = el(
      'button',
      {
        class: 'text-button',
        'aria-pressed': String(getSaved().has(work.id)),
        onclick: async () => {
          save.disabled = true;
          try {
            await onSave(work);
            save.textContent = getSaved().has(work.id)
              ? 'Remove from collection'
              : 'Save to collection';
            save.setAttribute('aria-pressed', String(getSaved().has(work.id)));
          } finally {
            save.disabled = false;
            syncUndo();
          }
        },
      },
      icon(getSaved().has(work.id) ? 'bookmark-check' : 'bookmark'),
      getSaved().has(work.id) ? 'Remove from collection' : 'Save to collection',
    );
    return el(
      'li',
      { class: 'place-publication', 'data-place-work': work.id },
      el('button', { class: 'place-publication-title', onclick: () => inspect(work) }, work.title),
      publicationMetadata(work),
      evidence &&
        el(
          'p',
          { class: 'place-evidence-label' },
          icon('map-pin'),
          `“${evidence.alias}” mentioned in ${evidence.field}. Relevance needs review.`,
        ),
      evidence && el('blockquote', {}, evidence.text),
      el(
        'div',
        { class: 'place-publication-actions' },
        save,
        externalLink('Open publication', doiURL(work.doi)),
      ),
    );
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
          'Choose a site on the map to find publications in Crossref. You can use Places before saving anything to your collection.',
        ),
        el(
          'div',
          { class: 'place-starts' },
          ['Abydos', 'Amarna', 'Thebes', 'Deir el-Medina'].map((name) => {
            const site = gazetteer.sites.find((site) => site.name === name);
            return el(
              'button',
              { class: 'text-button', onclick: () => choose(site.id) },
              icon('map-pin'),
              name,
            );
          }),
        ),
        el(
          'p',
          { class: 'scope-note' },
          'Crossref does not supply a standard geographic subject field. Places uses gazetteer names to help you discover and evaluate publication metadata.',
        ),
      );
      return;
    }
    const aliases = [...new Set([current.name, ...current.aliases])].filter(
      (name) => name.length >= 4 && name.length <= 60,
    );
    const refinementOpen =
      root.querySelector('.place-search-refinements')?.open ??
      !matchMedia('(max-width:899px)').matches;
    const refinementSummary = el('summary');
    function draftStatus() {
      const pending =
        (searchDraft.term || term || current.name) !== (term || current.name) ||
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
          { value: alias, selected: alias === (searchDraft.term || term || current.name) },
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
          el('label', { for: 'placeSearchName' }, 'Search name', name),
          el('label', { for: 'placeTopic' }, 'Topic (optional)', topicInput),
          el(
            'button',
            { class: 'button button-primary', type: 'submit', disabled: loading },
            icon('search'),
            'Search Crossref',
          ),
        ),
      ),
      el(
        'p',
        { class: 'scope-note' },
        `Applied search: ${term || current.name} · ${topic || 'Any topic'}`,
      ),
      el(
        'details',
        { class: 'places-source' },
        el('summary', {}, 'How place discovery works'),
        el(
          'p',
          {},
          'Crossref keyword searches return ranked candidates, not an exhaustive bibliography. A name mention in a title or supplied abstract is a suggestion to review, not a verified geographic subject. Search names come from reviewed Pleiades variants and can refer to different periods or locations.',
        ),
      ),
    );
    if (origin) {
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
          ? el('ol', { class: 'place-publications' }, explicit.map(publicationRow))
          : el(
              'p',
              {},
              'No loaded candidate explicitly mentions a recognized place name. Try another search name or inspect the other candidates.',
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
              'These records have no recognized mention in the title or supplied abstract. Inspect them before associating them with this place.',
            ),
            el('ol', { class: 'place-publications' }, other.map(publicationRow)),
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
    capture,
    cancel,
    location,
    choose,
    refresh: () => {
      if (active) {
        renderPublications();
        panels.inspector.refresh();
        syncUndo();
      }
    },
  };
}
