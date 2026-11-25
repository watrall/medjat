import { DATE_BROWSE_LIMIT, MAX_ROWS, PAGE_SIZE } from './crossref.js';
import { LARGE_WINDOW_SIZE, WINDOW_SIZE } from './aggregates.js';

const LIMITS = {
  pageSize: PAGE_SIZE,
  maxRows: MAX_ROWS,
  dateLimit: DATE_BROWSE_LIMIT,
  windowSize: WINDOW_SIZE,
  largeWindowSize: LARGE_WINDOW_SIZE,
};

// Search help is a modal opened from any element with data-help-open="<tab>[:<section>]".
export function createHelpDialog() {
  const dialog = document.getElementById('searchHelp');
  const title = document.getElementById('searchHelpTitle');
  const body = dialog.querySelector('.help-body');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const panel = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

  // The numbers come from the code that enforces them, so the text cannot drift from it.
  for (const node of dialog.querySelectorAll('[data-help]'))
    node.textContent = LIMITS[node.dataset.help].toLocaleString();

  function choose(selected, { focus = false } = {}) {
    for (const tab of tabs) {
      const on = tab === selected;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panel(tab).hidden = !on;
    }
    body.scrollTop = 0;
    if (focus) selected.focus();
  }
  function open(topic) {
    const [name, section] = topic.split(':');
    choose(tabs.find((tab) => tab.dataset.tab === name) ?? tabs[0]);
    if (!dialog.open) dialog.showModal();
    title.focus({ preventScroll: true });
    document.getElementById(`help-${section}`)?.scrollIntoView({ block: 'start' });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-help-open]');
    if (trigger) open(trigger.dataset.helpOpen);
  });
  // A click on the backdrop is reported on the dialog itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  const tabList = dialog.querySelector('[role="tablist"]');
  tabList.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) choose(tab);
  });
  tabList.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const index = tabs.indexOf(event.target);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : step
            ? (index + step + tabs.length) % tabs.length
            : -1;
    if (next < 0) return;
    event.preventDefault();
    choose(tabs[next], { focus: true });
  });
}
