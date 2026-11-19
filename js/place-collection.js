import { preservePlaceFocus } from './place-focus.js';
import { publicationMetadata, assignmentLabel } from './place-publication.js';
import { placeEvidence } from './place-data.js';
import { createPlaceReviewList } from './place-review-list.js';
import { researchData, reviewDecision } from './research-store.js';
import { placeKey, placeScopeKey } from './decision-keys.js';
import { EXPORT_FORMATS, exportCollection, downloadFile } from './export.js';
import { el, icon, notify } from './dom.js';
const noun = (count) => (count === 1 ? 'publication' : 'publications');

export function collectionPlaces(records, sites, decisions = {}) {
  const associations = [],
    rejected = [],
    unassigned = [],
    notSpecific = [];
  const counts = new Map();
  for (const { work } of records.values()) {
    if (decisions[placeScopeKey(work.id)]?.decision === 'not-place-specific') {
      notSpecific.push(work);
      continue;
    }
    let found = false;
    for (const place of sites) {
      const key = placeKey(work.id, place.id),
        review = decisions[key],
        evidence = placeEvidence(work, place);
      if (!evidence && !['confirmed', 'rejected'].includes(review?.decision)) continue;
      const association = {
        work,
        place,
        evidence,
        key,
        status: review?.decision || 'suggested',
        method: review?.method || 'metadata',
      };
      if (association.status === 'rejected') {
        rejected.push(association);
        continue;
      }
      found = true;
      associations.push(association);
      counts.set(place.id, (counts.get(place.id) || 0) + 1);
    }
    if (!found) unassigned.push(work);
  }
  return {
    associations,
    rejected,
    unassigned,
    notSpecific,
    counts,
    mapped: new Set(associations.map((link) => link.work.id)).size,
  };
}

export function createPlaceCollection(
  root,
  {
    sites,
    getSaved,
    onInspect,
    onRemove,
    onChoose,
    onRefresh,
    getStatus = () => 'all',
    onStatus = () => {},
    initialDraft = {},
    onDraft = () => {},
  },
) {
  let selected = '',
    status = getStatus(),
    snapshot,
    exportJob = null,
    exporting = false,
    exportMessage = '';
  let scopeUndo = null;
  function classify(work) {
    const key = placeScopeKey(work.id);
    const previous = researchData()[key];
    scopeUndo = { key, previous: previous || { decision: 'place-specific' }, work };
    decide(key, {
      decision: 'not-place-specific',
      previousDecision: previous?.decision || 'place-specific',
    });
    refresh();
    notify(`Marked “${work.title}” not place-specific. Your association reviews are retained.`);
  }
  let draft = {
    query: '',
    work: '',
    target: '',
    format: '',
    open: false,
    ...(initialDraft || {}),
  };
  function capture() {
    return draft;
  }
  const decide = (key, value) => {
    if (!reviewDecision(key, value))
      notify('Place review is kept for this visit only. Export a JSON backup to retain it.');
  };
  function refresh() {
    render(selected);
    onRefresh();
  }
  function review(link, decision) {
    decide(link.key, {
      decision,
      doi: link.work.id,
      place: link.place.id,
      source: link.place.source,
      evidence: link.evidence?.text || 'Assigned by researcher',
      method: link.method,
    });
    refresh();
    notify(`${link.place.name} association ${decision} for “${link.work.title}”.`);
    const row = [...root.querySelectorAll('[data-place-work]')].find(
      (row) => row.dataset.placeWork === link.work.id,
    );
    (
      row?.querySelector('.place-publication-title') ||
      root.querySelector('#placeAssociationStatus')
    ).focus({ preventScroll: true });
  }
  const filtered = () =>
    snapshot.associations.filter(
      (link) =>
        (!selected || link.place.id === selected) && (status === 'all' || link.status === status),
    );
  function stats(id) {
    return (
      snapshot?.associations.filter(
        (link) => link.place.id === id && (status === 'all' || link.status === status),
      ).length || 0
    );
  }
  function syncExport() {
    const state = root.querySelector('[data-export-status]');
    if (state) state.textContent = exportMessage;
    const button = root.querySelector('[data-place-export]');
    if (button) button.disabled = exporting || !filtered().length;
    const cancel = root.querySelector('[data-cancel-export]');
    if (cancel) cancel.hidden = !exporting;
  }
  async function runExport(format) {
    if (exporting) return;
    const ids = new Set(filtered().map((link) => link.work.id)),
      records = new Map([...getSaved()].filter(([id]) => ids.has(id)));
    if (!records.size) return;
    const job = Object.freeze({
      label: sites.find((site) => site.id === selected)?.name || 'all associated places',
      scope: `place-${selected || 'associated'}-${status}`,
      count: records.size,
      format,
      date: new Date().toISOString().slice(0, 10),
      records: structuredClone(records),
    });
    const { label } = job;
    const controller = new AbortController();
    exportJob = controller;
    exporting = true;
    exportMessage = `Preparing ${records.size} saved ${noun(records.size)} for ${label}…`;
    syncExport();
    try {
      const text = await exportCollection(job.records, job.format, {
        signal: controller.signal,
        research: researchData(),
        onProgress: (done, total) => {
          exportMessage = `Preparing ${done} of ${total} publications for ${label}…`;
          syncExport();
        },
      });
      controller.signal.throwIfAborted();
      downloadFile(text, job.format, job);
      exportMessage = `Exported ${records.size} ${noun(records.size)} for ${label}.`;
    } catch (error) {
      exportMessage = controller.signal.aborted
        ? 'Place bibliography export cancelled.'
        : `Export for ${label} failed: ${error.message} No bibliography was downloaded. Retry this scope or use CSV.`;
    } finally {
      exporting = false;
      syncExport();
    }
  }
  function render(placeID) {
    const restore = preservePlaceFocus(root);
    renderContent(placeID);
    restore();
  }
  function renderContent(placeID) {
    const samePlace = selected === placeID;
    capture();
    const draftWork = draft.work;
    const draftTarget = samePlace ? draft.target : placeID;
    const draftFormat = draft.format;
    const assignmentOpen = draft.open;
    selected = placeID;
    snapshot = collectionPlaces(getSaved(), sites, researchData());
    const current = sites.find((site) => site.id === selected),
      links = filtered(),
      works = [...new Map(links.map((link) => [link.work.id, link.work])).values()];
    const filter = el(
      'select',
      {
        id: 'placeAssociationStatus',
        onchange: (event) => {
          status = event.target.value;
          onStatus(status);
          refresh();
          root.querySelector('#placeAssociationStatus').focus();
        },
      },
      [
        ['all', 'Suggested and confirmed'],
        ['confirmed', 'Researcher-confirmed'],
        ['suggested', 'Suggested from metadata'],
      ].map(([value, label]) => el('option', { value, selected: value === status }, label)),
    );
    root.replaceChildren(
      el(
        'h2',
        { tabindex: '-1' },
        current ? `${current.name} in your collection` : 'Places in your collection',
      ),
      el(
        'p',
        { class: 'place-collection-coverage', role: 'status' },
        `${getSaved().size} saved ${noun(getSaved().size)} · ${snapshot.mapped} with place associations · ${snapshot.unassigned.length} with no place assigned · ${snapshot.notSpecific.length} marked not place-specific`,
      ),
      el(
        'label',
        { class: 'place-status-control', for: 'placeAssociationStatus' },
        'Association evidence',
        filter,
      ),
      el(
        'button',
        {
          class: 'text-button',
          onclick: () => {
            const assignment = root.querySelector('.place-assignment');
            assignment.open = true;
            root.querySelector('#assignPlaceSearch').focus({ preventScroll: true });
            assignment.scrollIntoView({ block: 'start' });
          },
          disabled: !getSaved().size,
        },
        icon('map-pin'),
        'Assign a publication',
      ),
    );
    root.append(
      el(
        'details',
        { class: 'places-source' },
        el('summary', {}, 'Evidence and classification'),
        el(
          'p',
          { id: 'placeScopeHelp' },
          'Associations describe your saved bibliography, not all scholarship. Suggestions need your review; a work can concern several places. Not place-specific hides its associations without deleting your reviews. Reset classification restores them.',
        ),
      ),
    );
    if (scopeUndo)
      root.append(
        el(
          'div',
          { class: 'place-undo' },
          el('p', { role: 'status' }, `Marked “${scopeUndo.work.title}” not place-specific.`),
          el(
            'button',
            {
              class: 'text-button',
              onclick: () => {
                decide(scopeUndo.key, scopeUndo.previous);
                scopeUndo = null;
                refresh();
              },
            },
            'Undo classification',
          ),
        ),
      );
    const format = el(
      'select',
      { id: 'placeExportFormat' },
      Object.entries(EXPORT_FORMATS).map(([value, metadata]) =>
        el('option', { value }, metadata.shortLabel),
      ),
    );
    root.append(
      el(
        'div',
        { class: 'place-bibliography-export' },
        el(
          'p',
          {},
          `${works.length} saved ${noun(works.length)} · ${current?.name || 'All places'} · ${status === 'confirmed' ? 'Researcher-confirmed' : status === 'suggested' ? 'Suggested from metadata' : 'Suggested and confirmed'}`,
        ),
        el(
          'div',
          { class: 'place-export-controls' },
          el('label', { for: 'placeExportFormat' }, 'Bibliography format', format),
          el(
            'button',
            {
              class: 'button',
              'data-place-export': true,
              disabled: !works.length || exporting,
              onclick: () => runExport(format.value),
            },
            icon('download'),
            `Export ${works.length} ${noun(works.length)}`,
          ),
          el(
            'button',
            {
              class: 'text-button',
              'data-cancel-export': true,
              hidden: !exporting,
              onclick: () => exportJob?.abort(),
            },
            'Cancel export',
          ),
        ),
        el(
          'p',
          { class: 'scope-note' },
          'Exports a snapshot of the saved publications matching the selected place and evidence controls.',
        ),
        el('p', { role: 'status', 'data-export-status': true }, exportMessage),
      ),
    );
    const list = el('ol', { class: 'place-publications' });
    for (const work of works) {
      const associations = links.filter((link) => link.work.id === work.id);
      const row = el(
        'li',
        { class: 'place-publication', 'data-place-work': work.id },
        el(
          'button',
          { class: 'place-publication-title', onclick: () => onInspect(work) },
          work.title,
        ),
        publicationMetadata(work),
      );
      row.append(
        el(
          'div',
          { class: 'place-publication-actions' },
          el(
            'button',
            {
              class: 'text-button',
              'aria-describedby': 'placeScopeHelp',
              onclick: () => classify(work),
            },
            'Not place-specific',
          ),
          el(
            'button',
            {
              class: 'text-button',
              onclick: async (event) => {
                event.currentTarget.disabled = true;
                await onRemove?.(work);
                refresh();
              },
            },
            'Remove from collection',
          ),
        ),
      );
      for (const link of associations)
        row.append(
          el(
            'div',
            { class: 'place-association', 'data-place-association': link.place.id },
            el(
              'button',
              { class: 'text-button', onclick: () => onChoose(link.place.id) },
              icon('map-pin'),
              link.place.name,
            ),
            el(
              'p',
              { class: 'scope-note' },
              link.status === 'confirmed'
                ? `Researcher-confirmed${link.method === 'researcher' ? ' · assigned manually' : ''}`
                : `Suggested · name found in ${link.evidence.field}`,
            ),
            link.evidence && el('blockquote', {}, link.evidence.text),
            el(
              'div',
              { class: 'place-publication-actions' },
              link.status === 'suggested' &&
                el(
                  'button',
                  { class: 'text-button', onclick: () => review(link, 'confirmed') },
                  'Confirm association',
                ),
              el(
                'button',
                { class: 'text-button', onclick: () => review(link, 'rejected') },
                'Reject association',
              ),
            ),
          ),
        );
      list.append(row);
    }
    if (works.length) root.append(list);
    else
      root.append(
        el(
          'p',
          {},
          getSaved().size
            ? 'No saved publications match this scope. Choose All places, change the evidence filter, or assign a publication below.'
            : 'This browser has no saved publications. Save works from Explore or Discover in Crossref, or import a backup in Collection.',
        ),
      );
    const savedWorks = [...getSaved().values()].map(({ work }) => work);
    const publication = el('select', { id: 'assignPlaceWork', required: true });
    let chosen = getSaved().has(draftWork) ? draftWork : savedWorks[0]?.id || '';
    draft.work = chosen;
    const preview = el('div', {
      class: 'place-assignment-preview',
      'aria-label': 'Selected publication',
    });
    const matchCount = el('p', { class: 'scope-note', role: 'status' });
    function showPreview() {
      const work = getSaved().get(chosen)?.work;
      preview.replaceChildren(
        ...(work
          ? [el('p', {}, work.title), publicationMetadata(work)]
          : [el('p', {}, 'Choose a saved publication.')]),
      );
    }
    function filterAssignments() {
      const query = assignmentSearch.value.trim().toLocaleLowerCase();
      const matches = savedWorks.filter((work) =>
        assignmentLabel(work).toLocaleLowerCase().includes(query),
      );
      publication.replaceChildren(
        el('option', { value: '' }, 'Choose a publication'),
        ...matches.map((work) => el('option', { value: work.id }, assignmentLabel(work))),
      );
      if (chosen && !matches.some((work) => work.id === chosen)) {
        const work = getSaved().get(chosen)?.work;
        if (work)
          publication.append(
            el('option', { value: chosen }, `Selected outside search: ${assignmentLabel(work)}`),
          );
      }
      publication.value = chosen;
      matchCount.textContent = `${matches.length} matching ${noun(matches.length)}${chosen && !matches.some((work) => work.id === chosen) ? ' · selected publication retained outside search' : ''}.`;
      showPreview();
    }
    const assignmentSearch = el('input', {
      id: 'assignPlaceSearch',
      type: 'search',
      value: draft.query || '',
      placeholder: 'Title, author, year or DOI',
      oninput: () => {
        draft.query = assignmentSearch.value;
        filterAssignments();
        onDraft();
      },
    });
    publication.addEventListener('change', () => {
      chosen = publication.value;
      draft.work = chosen;
      showPreview();
      onDraft();
    });
    filterAssignments();
    const target = el(
      'select',
      { id: 'assignPlaceTarget' },
      [...sites]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((site) => el('option', { value: site.id, selected: selected === site.id }, site.name)),
    );
    const assignment = el(
      'details',
      { class: 'place-assignment' },
      el('summary', {}, 'Assign a place to a saved publication'),
      el(
        'p',
        { class: 'scope-note' },
        'Use your reading of the publication when its title or abstract does not provide enough evidence. Your assignment is recorded as researcher-supplied.',
      ),
      el(
        'label',
        { class: 'place-status-control', for: 'assignPlaceSearch' },
        'Find a saved publication',
        assignmentSearch,
      ),
      matchCount,
      el(
        'button',
        {
          class: 'text-button',
          type: 'button',
          onclick: () => {
            assignmentSearch.value = '';
            draft.query = '';
            filterAssignments();
            assignmentSearch.focus();
            onDraft();
          },
        },
        'Clear publication search',
      ),
      preview,
      el(
        'form',
        {
          class: 'place-search-form',
          onsubmit: (event) => {
            event.preventDefault();
            const work = getSaved().get(publication.value)?.work,
              place = sites.find((site) => site.id === target.value);
            if (!work || !place) return;
            decide(placeScopeKey(work.id), { decision: 'place-specific' });
            decide(placeKey(work.id, place.id), {
              decision: 'confirmed',
              method: 'researcher',
              doi: work.id,
              place: place.id,
              source: place.source,
            });
            selected = place.id;
            onChoose(place.id);
            root.querySelector('h2')?.focus({ preventScroll: true });
            notify(`Assigned “${work.title}” to ${place.name}.`);
          },
        },
        el('label', { for: 'assignPlaceWork' }, 'Saved publication', publication),
        el('label', { for: 'assignPlaceTarget' }, 'Ancient place', target),
        el(
          'button',
          { class: 'button', type: 'submit', disabled: !getSaved().size },
          'Assign place',
        ),
      ),
    );
    root.append(assignment);
    assignment.open = assignmentOpen || false;
    draft.open = assignment.open;
    assignment.addEventListener('toggle', () => {
      draft.open = assignment.open;
      onDraft();
    });
    target.addEventListener('change', () => {
      draft.target = target.value;
      onDraft();
    });
    format.addEventListener('change', () => {
      draft.format = format.value;
      onDraft();
    });

    if (draftTarget && sites.some((site) => site.id === draftTarget)) target.value = draftTarget;
    if (draftFormat) format.value = draftFormat;
    draft.target = target.value;
    draft.format = format.value;
    const reviewList = (title, rows, mode) =>
      createPlaceReviewList({
        title,
        rows,
        mode,
        onInspect,
        onAssign: (work) => {
          assignment.open = true;
          chosen = work.id;
          filterAssignments();
          target.focus();
        },
        onReset: (work) => {
          const prior = researchData()[placeScopeKey(work.id)];
          decide(placeScopeKey(work.id), {
            decision: prior?.previousDecision || 'place-specific',
          });
          refresh();
        },
        onClassify: classify,
      });
    root.append(
      reviewList('No place assigned', snapshot.unassigned, 'assign'),
      reviewList('Not place-specific', snapshot.notSpecific, 'reset'),
    );
    if (snapshot.rejected.length)
      root.append(
        el(
          'details',
          { class: 'places-source' },
          el('summary', {}, `Rejected associations (${snapshot.rejected.length})`),
          el(
            'ul',
            { class: 'place-review-works' },
            snapshot.rejected.map((link) =>
              el(
                'li',
                {},
                `${link.work.title} · ${link.place.name}`,
                el(
                  'button',
                  {
                    class: 'text-button',
                    onclick: () => review(link, link.evidence ? 'suggested' : 'confirmed'),
                  },
                  'Restore association',
                ),
              ),
            ),
          ),
        ),
      );
  }
  return {
    render,
    capture,
    stats,
    cancel() {
      exportJob?.abort();
    },
  };
}
