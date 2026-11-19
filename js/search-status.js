import { PAGE_SIZE } from './crossref.js';
import { el, icon } from './dom.js';

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
  { nextCursor, browseLimited, previous, loading, onLoadMore },
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
      ),
    );
}
