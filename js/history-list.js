import { el, icon, notify } from './dom.js';

const VISIBLE_SEARCHES = 6;

export function createHistoryList(section, list, clearButton, { history, onOpen }) {
  let expanded = false;
  const more = el('button', {
    class: 'text-button history-more',
    type: 'button',
    'aria-expanded': 'false',
    onclick: () => {
      expanded = !expanded;
      render();
    },
  });
  list.after(more);

  function row(entry) {
    return el(
      'li',
      { class: 'history-row' },
      el(
        'a',
        { class: 'history-link', href: `?${entry.qs}`, 'data-history': entry.qs },
        el('span', { class: 'history-query' }, entry.query.q),
        entry.detail && el('span', { class: 'history-detail' }, entry.detail),
      ),
      el(
        'div',
        { class: 'history-actions' },
        el(
          'button',
          {
            class: 'text-button',
            'data-keep': entry.qs,
            'aria-pressed': String(entry.kept),
            'aria-label': `${entry.kept ? 'Stop keeping' : 'Keep'} search: ${entry.query.q}`,
            onclick: () => {
              if (!history.toggleKept(entry.qs)) notify('Remove a kept search to keep another.');
              render({ keep: entry.qs });
            },
          },
          icon(entry.kept ? 'bookmark-check' : 'bookmark'),
          entry.kept ? 'Kept' : 'Keep',
        ),
        el(
          'button',
          {
            class: 'text-button',
            'aria-label': `Remove search: ${entry.query.q}`,
            onclick: (event) => {
              const index = [...list.children].indexOf(event.currentTarget.closest('li'));
              history.remove(entry.qs);
              render({ index });
            },
          },
          icon('x'),
          'Remove',
        ),
      ),
    );
  }

  // After a change the list is rebuilt, so put focus back where the reader was.
  function render({ keep, index } = {}) {
    const entries = [...history.kept(), ...history.recent()];
    const shown = expanded ? entries : entries.slice(0, VISIBLE_SEARCHES);
    section.hidden = !entries.length;
    clearButton.hidden = !history.recent().length;
    list.replaceChildren(...shown.map(row));
    more.hidden = entries.length <= VISIBLE_SEARCHES;
    more.setAttribute('aria-expanded', String(expanded));
    more.textContent = expanded ? 'Show fewer searches' : `Show all ${entries.length} searches`;
    if (keep) list.querySelector(`[data-keep="${CSS.escape(keep)}"]`)?.focus();
    else if (index !== undefined)
      (
        list.children[Math.min(index, list.children.length - 1)]?.querySelector('a') ||
        section.querySelector('h2')
      ).focus();
  }
  clearButton.addEventListener('click', () => {
    history.clearRecent();
    render();
  });
  list.addEventListener('click', (event) => {
    const link = event.target.closest('.history-link');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onOpen(link.dataset.history);
  });
  render();
  return { render };
}
