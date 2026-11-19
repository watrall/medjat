// Loaded only when Places opens. Geographic data and tiles have separate provenance.
export async function createPlaceMap(root, { sites, onSelect, onError }) {
  const L = await import('../assets/vendor/leaflet/leaflet-src.esm.js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map = L.map(root, {
    scrollWheelZoom: false,
    minZoom: 4,
    maxZoom: 15,
    zoomAnimation: !reduced,
    fadeAnimation: !reduced,
  });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: 'places-basemap',
  }).addTo(map);
  let failed = false;
  tiles.on('tileerror', () => {
    if (!failed) {
      failed = true;
      onError();
    }
  });
  const overview = () =>
    map.fitBounds(
      sites.map((site) => [site.latitude, site.longitude]),
      { padding: [35, 35], animate: false },
    );
  overview();
  const layer = L.layerGroup().addTo(map);
  let selected = '';
  function draw() {
    const focused =
      root.contains(document.activeElement) &&
      document.activeElement.classList.contains('place-pin');
    layer.clearLayers();
    const size = map.getSize(),
      groups = [];
    // Screen-space grouping preserves distinct 44px targets at every zoom.
    const ordered = [...sites].sort(
      (a, b) => Number(b.id === selected) - Number(a.id === selected) || b.latitude - a.latitude,
    );
    for (const site of ordered) {
      const point = map.latLngToContainerPoint([site.latitude, site.longitude]);
      if (
        point.x < 25 ||
        point.y < 25 ||
        point.x > size.x - 25 ||
        point.y > size.y - 40 ||
        (point.x < 80 && point.y < 120)
      )
        continue;
      const group = groups.find(
        (group) => Math.abs(group.point.x - point.x) < 50 && Math.abs(group.point.y - point.y) < 50,
      );
      if (group) group.sites.push(site);
      else groups.push({ point, sites: [site] });
    }
    for (const group of groups) {
      const site = group.sites[0],
        multiple = group.sites.length > 1,
        active = group.sites.some((site) => site.id === selected);
      const name = multiple
        ? `Zoom to ${group.sites.length} places near ${site.name}`
        : `Select ${site.name}`;
      const marker = L.marker([site.latitude, site.longitude], {
        title: name,
        keyboard: true,
        icon: L.divIcon({
          className: `place-pin${active ? ' is-selected' : ''}`,
          html: multiple
            ? `<span class="place-cluster">${group.sites.length}</span>`
            : '<span class="place-pin-dot"></span>',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
      }).addTo(layer);
      const label = document.createElement('span');
      label.textContent = multiple ? group.sites.map((site) => site.name).join(' · ') : site.name;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -8] });
      marker.on('click', () => {
        if (multiple) {
          map.fitBounds(
            group.sites.map((site) => [site.latitude, site.longitude]),
            { padding: [60, 60], maxZoom: Math.min(map.getZoom() + 2, 15), animate: false },
          );
          root.focus({ preventScroll: true });
        } else onSelect(site.id);
      });
      const element = marker.getElement();
      element.setAttribute('aria-label', name);
      element.setAttribute('aria-pressed', String(active));
      if (active) {
        marker.setZIndexOffset(1000);
        marker.openTooltip();
      }
    }
    if (focused) root.focus({ preventScroll: true });
  }
  map.on('moveend zoomend resize', draw);
  draw();
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(root);
  return {
    select(id, { focus = false } = {}) {
      selected = id;
      const site = sites.find((site) => site.id === id);
      if (focus && site)
        map.setView([site.latitude, site.longitude], Math.max(map.getZoom(), 7), {
          animate: false,
        });
      draw();
    },
    overview,
    resize: () => map.invalidateSize(),
    destroy() {
      observer.disconnect();
      map.remove();
    },
  };
}
