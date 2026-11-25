import { PAGE_SIZE } from './crossref.js';
import { el, externalLink, helpLink, icon } from './dom.js';

const BEYOND_CROSSREF = [
  ['Google Scholar', (q) => `https://scholar.google.com/scholar?q=${q}`],
  ['WorldCat (books and libraries)', (q) => `https://search.worldcat.org/search?q=${q}`],
  ['Internet Archive Scholar (open full text)', (q) => `https://scholar.archive.org/search?q=${q}`],
  ['Open Library (books)', (q) => `https://openlibrary.org/search?q=${q}`],
];

export function renderSearchNotice(container, { error, retryable, onAction }) {
  container.hidden = !error;
  if (!error) return;
  container.replaceChildren(
    el(
      'div',
      { class: 'notice notice-error' },
      icon('circle-alert'),
      el(
        'div',
        {},
        el('p', {}, error),
        el(
          'button',
          { class: 'button', onclick: onAction },
          retryable ? 'Retry search' : 'Edit search',
        ),
      ),
    ),
  );
}

export function renderSearchFooter(
  container,
  { nextCursor, browseLimited, previous, loading, onLoadMore, beyondQuery = '' },
) {
  container.replaceChildren();
  if (nextCursor && !previous)
    container.append(
      el(
        'button',
        { class: 'button', disabled: loading, onclick: onLoadMore },
        loading ? 'Loading…' : `Load ${PAGE_SIZE} more publications`,
      ),
      el(
        'p',
        { class: 'scope-note' },
        'Only loaded records are shown. Search more specifically to improve relevance.',
      ),
    );
  if (browseLimited && !previous)
    container.append(
      el(
        'p',
        { class: 'scope-note' },
        'You have reached the publication-date browsing limit. Narrow the publication years or topic, or switch to relevance.',
        ' ',
        helpLink('limits:load'),
      ),
    );
  if (beyondQuery && !loading)
    container.append(
      el(
        'details',
        { class: 'beyond-crossref' },
        el('summary', {}, 'Search beyond Crossref'),
        el(
          'p',
          { class: 'scope-note' },
          'Crossref lists works with a registered DOI, so many books, older articles, and site reports are missing. These links open another site with your search words.',
        ),
        el(
          'ul',
          { class: 'beyond-list' },
          BEYOND_CROSSREF.map(([label, url]) =>
            el('li', {}, externalLink(label, url(encodeURIComponent(beyondQuery)))),
          ),
        ),
      ),
    );
}
