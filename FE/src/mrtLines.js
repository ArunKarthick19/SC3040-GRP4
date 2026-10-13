// Shared map helpers: MRT line colours, distances and the OneMap credit

// Official MRT line colours, by station code prefix
const LINE_COLORS = {
  EW: '#009645', CG: '#009645', NS: '#d42e12', NE: '#9900aa', CC: '#fa9e0d', CE: '#fa9e0d',
  DT: '#005ec4', TE: '#9d5b25',
};

export const lineColor = (code) => LINE_COLORS[code.slice(0, 2)] ?? '#748477'; // LRT and others: grey

export const distance = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

// Straight-line distance in metres between two points (haversine)
function metresBetween(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// The CBD, taken as Raffles Place MRT
const CBD = { lat: 1.283933, lng: 103.851463 };

export const cbdDistance = (lat, lng) => Math.round(metresBetween(lat, lng, CBD.lat, CBD.lng));

export const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
