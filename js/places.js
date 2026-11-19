import { loadGazetteer, placeEvidence, placesForWork, searchPlaceWorks } from './place-data.js';
import { createPlaceMap } from './place-map.js';
import { createInspector } from './inspector.js';
import { authorLine, doiURL } from './data.js';
import { el, icon, externalLink, skeletons } from './dom.js';

export function createPlaces(root, { getSaved, onSave, onLocation = () => {} }) {
  let gazetteer,
    map,
    selected = '',
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
  const place = () => gazetteer?.sites.find((site) => site.id === selected);
  function cancel() {
    active = false;
    loading = false;
    generation++;
    mountGeneration++;
    controller?.abort();
  }
  function location() {
    return { place: selected };
  }
  async function show(options = {}) {
    active = true;
    if ('place' in options && selected !== options.place) {
      selected = options.place;
      works = [];
      next = null;
      total = null;
      term = '';
      topic = '';
    }
    origin = options.origin || null;
    try {
      gazetteer ||= await loadGazetteer();
      if (!active) return;
      if (!place()) selected = '';
      map?.destroy();
      map = null;
      build();
      try {
        const current = ++mountGeneration;
        const instance = await createPlaceMap(panels.map, {
          sites: gazetteer.sites,
          onSelect: (id) => choose(id),
          onError: () => {
            panels.mapNotice.hidden = false;
            panels.mapNotice.textContent =
              'Map tiles could not be fully loaded. You can still choose a place and use the publication list.';
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
      if (selected && !works.length) await search();
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
      el('option', { value: '' }, 'Choose an ancient place'),
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
    const publications = el('section', {
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
      onClose: () => {
        detail.hidden = true;
        publications.hidden = false;
        publications.querySelector('h2')?.focus({ preventScroll: true });
      },
      onSave: async (work) => {
        await onSave(work);
        inspector.refresh();
      },
      isSaved: (id) => getSaved().has(id),
    });
    panels = { selector, map: mapRoot, mapNotice, publications, detail, inspector };
    root.replaceChildren(
      el(
        'div',
        { class: 'places-heading' },
        el(
          'div',
          {},
          el('p', { class: 'eyebrow' }, 'PLEIADES × CROSSREF'),
          el('h1', {}, 'Places'),
          el(
            'p',
            {},
            'Discover scholarship through ancient places. Build a bibliography with geographic context.',
          ),
        ),
        externalLink(
          ['Ancient places from Pleiades', icon('external-link')],
          'https://pleiades.stoa.org/',
          { class: 'text-button' },
        ),
      ),
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
            el(
              'button',
              { class: 'button', onclick: () => map?.overview() },
              icon('expand'),
              'Show all places',
            ),
          ),
          mapNotice,
          mapRoot,
          el(
            'p',
            { class: 'scope-note' },
            'Modern geographic context with ancient place locations. Select a marker or use the place selector. Pinch or use +/− to zoom.',
          ),
          el(
            'details',
            { class: 'places-source' },
            el('summary', {}, `${gazetteer.sites.length} curated places · sources and coverage`),
            el(
              'p',
              {},
              'This starting index is a curated selection, not a complete gazetteer of ancient Egypt. Representative points do not describe site boundaries. Place names and locations come from Pleiades; publication metadata comes from Crossref.',
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
    renderPublications();
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
    panels.selector.value = selected;
    panels.detail.hidden = true;
    panels.publications.hidden = false;
    map?.select(selected, { focus: true });
    onLocation(location());
    renderPublications();
    if (selected) search();
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
              ? 'Saved to collection'
              : 'Save to collection';
            save.setAttribute('aria-pressed', String(getSaved().has(work.id)));
          } finally {
            save.disabled = false;
          }
        },
      },
      icon(getSaved().has(work.id) ? 'bookmark-check' : 'bookmark'),
      getSaved().has(work.id) ? 'Saved to collection' : 'Save to collection',
    );
    return el(
      'li',
      { class: 'place-publication' },
      el('button', { class: 'place-publication-title', onclick: () => inspect(work) }, work.title),
      el(
        'p',
        { class: 'scope-note' },
        [authorLine(work), work.year, work.typeLabel].filter(Boolean).join(' · '),
      ),
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
    const name = el(
      'select',
      { id: 'placeSearchName' },
      aliases.map((alias) =>
        el('option', { value: alias, selected: alias === (term || current.name) }, alias),
      ),
    );
    const topicInput = el('input', {
      id: 'placeTopic',
      type: 'search',
      value: topic,
      placeholder: 'e.g. burial, ceramics, settlement',
    });
    root.replaceChildren(
      el('p', { class: 'eyebrow' }, 'DISCOVER IN CROSSREF'),
      el('h2', { tabindex: '-1' }, current.name),
      el(
        'p',
        { class: 'scope-note' },
        externalLink('Place identity and names', current.source),
        ` · ${current.latitude.toFixed(3)}°N, ${current.longitude.toFixed(3)}°E`,
      ),
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
      el(
        'p',
        { class: 'scope-note' },
        'Searches are ranked candidates, not an exhaustive bibliography of this place. A place name in metadata is evidence to inspect, not a verified subject classification.',
      ),
    );
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
          `${works.length} candidates loaded · ${explicit.length} mention this place in title or abstract`,
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
          el('button', { class: 'button', onclick: () => search(true) }, 'Load 25 more candidates'),
        );
    }
  }
  return {
    show,
    cancel,
    location,
    choose,
    refresh: () => {
      if (active) renderPublications();
    },
  };
}
