// Restore only focus that belonged to the updating surface. Background responses
// must never move a reader who has continued elsewhere.
export function preservePlaceFocus(root) {
  const active = document.activeElement;
  if (!root?.contains(active)) return () => {};
  const key = focusKey(active);
  const record = active.closest('[data-place-work]')?.dataset.placeWork;
  return () => {
    if (active.isConnected && !active.disabled) return;
    // An event handler may already have deliberately restored focus.
    if (
      document.activeElement !== document.body &&
      document.activeElement !== active &&
      document.activeElement?.isConnected
    )
      return;
    const controls = [...root.querySelectorAll('button, input, select, summary, [tabindex]')];
    const exact = controls.find(
      (node) => focusKey(node) === key && !node.disabled && !node.closest('[hidden]'),
    );
    const row = [...root.querySelectorAll('[data-place-work]')].find(
      (node) => node.dataset.placeWork === record,
    );
    (
      exact ||
      row?.querySelector('.place-publication-title') ||
      root.querySelector('h2') ||
      root
    )?.focus({ preventScroll: true });
  };
}
function focusKey(node) {
  if (node.id) return node.id;
  if (node.dataset.focusKey) return node.dataset.focusKey;
  return [
    node.closest('[data-place-work]')?.dataset.placeWork || '',
    node.closest('[data-place-association]')?.dataset.placeAssociation || '',
    node.tagName,
    node.textContent.trim(),
  ].join(':');
}
