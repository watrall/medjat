// Loaded only when Places opens. Geographic data and tiles have separate provenance.
import { icon } from './dom.js';
export async function createPlaceMap(
  root,
  { sites, onSelect, onError, isVisible = () => true, getCount = () => null },
) {
  const L = await import('../assets/vendor/leaflet/leaflet-src.esm.js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map = L.map(root, {
    scrollWheelZoom: false,
    minZoom: 4,
    maxZoom: 15,
    zoomAnimation: !reduced,
    markerZoomAnimation: false,
    fadeAnimation: !reduced,
  });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: 'places-basemap',
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  root.querySelector('.leaflet-control-zoom-in').replaceChildren(icon('plus'));
  root.querySelector('.leaflet-control-zoom-out').replaceChildren(icon('minus'));
  let failed = false,
    destroyed = false;
  tiles.on('tileerror', () => {
    if (!failed) {
      failed = true;
      onError();
    }
  });
  const overview = () => {
    const visible = sites.filter((site) => isVisible(site.id));
    map.fitBounds(
      (visible.length ? visible : sites).map((site) => [site.latitude, site.longitude]),
      { padding: [35, 35], maxZoom: 7, animate: false },
    );
  };
  overview();
  const layer = L.layerGroup().addTo(map);
  let selected = '';
  function draw() {
    if (destroyed) return;
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
      if (!isVisible(site.id) && site.id !== selected) continue;
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
      label.textContent = group.sites
        .map(
          (site) =>
            `${site.name}${getCount(site.id) === null ? '' : ` · ${getCount(site.id)} saved`}`,
        )
        .join(' / ');
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
  const observer = new ResizeObserver(() => {
    if (!destroyed) map.invalidateSize({ pan: false });
  });
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
    refresh: draw,
    retryTiles() {
      failed = false;
      tiles.redraw();
    },
    resize: () => map.invalidateSize(),
    destroy() {
      destroyed = true;
      observer.disconnect();
      map.off('moveend zoomend resize', draw);
      map.remove();
    },
  };
}
