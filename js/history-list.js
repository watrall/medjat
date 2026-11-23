import { el, notify } from './dom.js';

export function createHistoryList(section, list, clearButton, { history, onOpen }) {
  function render() {
    const kept = history.kept(),
      recent = history.recent();
    section.hidden = !kept.length && !recent.length;
    clearButton.hidden = !recent.length;
    list.replaceChildren(
      ...[...kept, ...recent].map((entry) =>
        el(
          'li',
          { class: 'history-row' },
          el(
            'a',
            { class: 'history-link', href: `?${entry.qs}`, 'data-history': entry.qs },
            el('span', { class: 'history-query' }, entry.query.q),
            entry.detail && el('span', { class: 'history-detail' }, entry.detail),
          ),
          el(
            'button',
            {
              class: 'text-button',
              'aria-pressed': String(entry.kept),
              'aria-label': `${entry.kept ? 'Stop keeping' : 'Keep'} search: ${entry.query.q}`,
              onclick: () => {
                if (!history.toggleKept(entry.qs)) notify('Remove a kept search to keep another.');
                render();
              },
            },
            entry.kept ? 'Kept' : 'Keep',
          ),
          el(
            'button',
            {
              class: 'text-button',
              'aria-label': `Remove search: ${entry.query.q}`,
              onclick: () => {
                history.remove(entry.qs);
                render();
              },
            },
            'Remove',
          ),
        ),
      ),
    );
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
