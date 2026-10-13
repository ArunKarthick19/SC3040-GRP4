// Official MRT line colours, by station code prefix
const LINE_COLORS = {
  EW: '#009645', CG: '#009645', NS: '#d42e12', NE: '#9900aa', CC: '#fa9e0d', CE: '#fa9e0d',
  DT: '#005ec4', TE: '#9d5b25',
};

export const lineColor = (code) => LINE_COLORS[code.slice(0, 2)] ?? '#748477'; // LRT and others: grey

export const distance = (m) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
