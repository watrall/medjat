// On phones the search tools sit under the navigation bar and a search button opens and closes them.
export function createSearchToggle() {
  const button = document.getElementById('searchToggle');
  const area = document.getElementById('searchArea');
  const input = document.getElementById('searchInput');
  const explore = document.getElementById('exploreNav');
  let open = true;

  function render() {
    // Collection and Places have no search area of their own, so the button reads as closed there.
    const shown = open && !document.body.classList.contains('is-collection');
    area.dataset.open = String(shown);
    button.setAttribute('aria-expanded', String(shown));
  }
  button.addEventListener('click', () => {
    if (document.body.classList.contains('is-collection')) {
      // Searching always happens in Explore.
      explore.click();
      open = true;
    } else {
      open = !open;
    }
    render();
    if (open) input.focus({ preventScroll: true });
  });
  new MutationObserver(render).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  render();
}
