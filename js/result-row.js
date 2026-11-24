import { authorLine, displayTitle, openLicenseURL } from './data.js';
import { el, icon } from './dom.js';
import { noticeLabel, reportableUpdates, updateLabel, updateSeverity } from './updates.js';

export function createResultRow(
  work,
  {
    view,
    selected,
    saved,
    selectedForExport,
    annotation,
    updates = work.updates,
    onOpen,
    onSave,
    onSelectionChange,
  },
) {
  const heading = displayTitle(work.title);
  const title = el(
    'button',
    {
      class: 'result-open',
      onclick: () => onOpen(work),
      'aria-label': `View ${heading}`,
    },
    heading,
  );
  const [update] = reportableUpdates(updates);
  const badges = [
    update && [
      updateSeverity(update.type) === 'serious' ? 'circle-alert' : 'info',
      updateLabel(update),
      `badge-${updateSeverity(update.type)}`,
    ],
    work.updateTo[0] && ['file-text', noticeLabel(work.updateTo[0])],
    work.abstract && ['file-text', 'Abstract'],
    work.authors.some((author) => author.orcid) && ['user-round', 'ORCID'],
    openLicenseURL(work) && ['book-open', 'Open license'],
    work.citedBy > 0 && ['quote', `Cited by ${work.citedBy.toLocaleString()}`],
    annotation?.note && ['file-text', 'Has note'],
    work.references.length > 0 && ['network', `${work.references.length} references`],
  ].filter(Boolean);
  return el(
    'li',
    {
      class: `result-row${selected ? ' is-selected' : ''}`,
      'data-record': work.id,
      'aria-current': selected ? 'true' : undefined,
    },
    el(
      'div',
      { class: 'result-top' },
      view === 'collection' &&
        el(
          'label',
          { class: 'select-publication' },
          el('input', {
            type: 'checkbox',
            checked: selectedForExport,
            'aria-label': `Select publication: ${heading}`,
            onchange: (event) => onSelectionChange(work.id, event.target.checked),
          }),
        ),
      el(view === 'collection' ? 'h2' : 'h3', {}, title),
      el(
        'button',
        {
          class: 'save-button',
          'aria-pressed': String(saved),
          'aria-label': `${saved ? 'Remove from' : 'Save to'} collection: ${heading}`,
          onclick: () => onSave(work),
        },
        icon(saved ? 'bookmark-check' : 'bookmark'),
        el('span', {}, saved ? 'Saved' : 'Save'),
      ),
    ),
    el(
      'p',
      { class: 'result-meta' },
      [authorLine(work), work.year || 'Date not supplied', work.container || work.publisher]
        .filter(Boolean)
        .join(' · '),
    ),
    work.abstract && el('p', { class: 'result-snippet' }, work.abstract),
    el(
      'div',
      { class: 'metadata-badges' },
      el('span', {}, work.typeLabel),
      badges.map(([name, label, tone]) =>
        el('span', { class: `metadata-badge${tone ? ` ${tone}` : ''}` }, icon(name), label),
      ),
      annotation?.tags.map((tag) => el('span', { class: 'metadata-badge tag-badge' }, `#${tag}`)),
    ),
  );
}
