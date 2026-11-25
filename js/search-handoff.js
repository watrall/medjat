// Keep search available without moving the page or interrupting keyboard input.
export function createSearchHandoff() {
  const header = document.querySelector('.masthead');
  const nav = document.querySelector('.main-nav');
  const row = document.getElementById('primarySearchRow');
  const form = document.getElementById('navSearchForm');
  const slot = document.querySelector('.nav-search-slot');
  const brandName = document.querySelector('.brand-name');
  const input = document.getElementById('navSearchInput');
  const primary = document.getElementById('searchInput');
  let view = 'explore';
  let observer;
  let lastVisible = false;
  let headerHeight = 0;

  function update() {
    const pastSearch = row.getBoundingClientRect().bottom <= headerHeight;
    const visible =
      view === 'collection' ||
      view === 'places' ||
      pastSearch ||
      form.contains(document.activeElement);
    lastVisible = visible;
    header.classList.toggle('has-nav-search', visible);
    form.inert = !visible;
    form.setAttribute('aria-hidden', String(!visible));
    document.documentElement.style.setProperty('--masthead-height', `${headerHeight}px`);
  }
  function measure() {
    // On phones only the navigation bar stays pinned; the logo bar scrolls away.
    const height = (matchMedia('(max-width: 639px)').matches ? nav : header).getBoundingClientRect()
      .height;
    headerHeight = height;
    if (matchMedia('(max-width: 999px)').matches) {
      const bounds = brandName.getBoundingClientRect();
      const headerBounds = header.getBoundingClientRect();
      form.style.setProperty('--nav-search-width', `${bounds.width}px`);
      form.style.setProperty(
        '--nav-search-center',
        `${bounds.left + bounds.width / 2 - headerBounds.left}px`,
      );
      form.style.setProperty(
        '--nav-search-top',
        `${bounds.top + bounds.height / 2 - headerBounds.top}px`,
      );
    }
    observer?.disconnect();
    // Extend below the fold so fast scroll jumps still cross an intersection boundary.
    observer = new IntersectionObserver(update, {
      rootMargin: `-${height}px 0px ${document.documentElement.scrollHeight}px 0px`,
      threshold: [0, 1],
    });
    observer.observe(row);
    update();
  }
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(header);
  resizeObserver.observe(nav);
  matchMedia('(max-width: 639px)').addEventListener('change', measure);
  resizeObserver.observe(slot);
  resizeObserver.observe(brandName);
  form.addEventListener('focusout', (event) => {
    if (!form.contains(event.relatedTarget)) requestAnimationFrame(update);
  });
  window.addEventListener('pageshow', update);
  measure();
  return {
    setView(next) {
      view = next;
      // Visibility styles change with the active workspace before the next paint.
      requestAnimationFrame(update);
    },
    searchInput() {
      return lastVisible ? input : primary;
    },
  };
}
