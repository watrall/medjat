export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== undefined && child !== null && child !== false)
      node.append(typeof child === 'number' ? String(child) : child);
  return node;
}
export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}
export function externalLink(label, href, attrs = {}) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, label);
}
export function emptyState(title, message, iconName = 'search') {
  return el(
    'div',
    { class: 'empty-state' },
    icon(iconName),
    el('h3', {}, title),
    el('p', {}, message),
  );
}
let toastTimer;
export function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}
export function skeletons(count = 4) {
  return Array.from({ length: count }, () =>
    el(
      'li',
      { class: 'skeleton-row', 'aria-hidden': 'true' },
      Array.from({ length: 3 }, () => el('div', { class: 'skeleton-line' })),
    ),
  );
}
