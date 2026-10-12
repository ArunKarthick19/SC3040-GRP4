import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const COLORS = { good: '#2f9e6b', ok: '#f0b429', bad: '#e6564c', none: '#d9d4d3' };

const money = (n) => `$${Math.round(n).toLocaleString('en-SG')}`;
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Town colour: share of this year's sales that were within budget
function townColor(info) {
  if (!info) return COLORS.none;
  if (info.share_within_budget >= 0.5) return COLORS.good;
  if (info.share_within_budget >= 0.2) return COLORS.ok;
  return COLORS.bad;
}

// Block colour: the block's median price against the budget
function blockColor(median, budget) {
  if (median <= budget) return COLORS.good;
  if (median <= budget * 1.1) return COLORS.ok;
  return COLORS.bad;
}

const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

function FitTo({ features }) {
  const map = useMap();
  useEffect(() => {
    if (features?.length) map.fitBounds(L.geoJSON(features).getBounds(), { padding: [24, 24] });
  }, [map, features]);
  return null;
}

function Legend({ view }) {
  const items = view === 'island'
    ? [[COLORS.good, '50%+ of sales in budget'], [COLORS.ok, '20–49%'], [COLORS.bad, 'Under 20%'], [COLORS.none, 'No sales of this flat type']]
    : [[COLORS.good, 'Median within budget'], [COLORS.ok, 'Up to 10% over'], [COLORS.bad, 'More than 10% over']];
  return (
    <ul className="map-legend">
      {items.map(([color, label]) => (
        <li key={label}><span style={{ background: color }} />{label}</li>
      ))}
    </ul>
  );
}

export default function TownHeatMap({ town, flatType, budget, townMap, year, onClose }) {
  const [boundaries, setBoundaries] = useState(null);
  const [selected, setSelected] = useState(town);
  const [view, setView] = useState('island');
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/sg_towns.geojson')
      .then((res) => res.json())
      .then(setBoundaries)
      .catch(() => setError('Could not load the map outlines.'));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (view !== 'blocks') return;
    const params = new URLSearchParams({ town: selected, flat_type: flatType });
    fetch(`${import.meta.env.VITE_API_URL}/api/buyer/town-blocks?${params}`)
      .then((res) => res.json())
      .then(setBlocks)
      .catch(() => setError('Could not load blocks for this town.'));
  }, [view, selected, flatType]);

  const selectedFeatures = useMemo(
    () => boundaries?.features.filter((f) => f.properties.town === selected),
    [boundaries, selected],
  );
  const info = townMap[selected];

  function openBlocks(name) {
    setBlocks(null);
    setSelected(name);
    setView('blocks');
  }

  function onEachTown(feature, layer) {
    const t = townMap[feature.properties.town];
    const label = t
      ? `<strong>${titleCase(t.town)}</strong><br/>${Math.round(t.share_within_budget * 100)}% in budget · median ${money(t.estimated_price)}<br/><em>Click to see blocks</em>`
      : `<strong>${titleCase(feature.properties.area)}</strong><br/>No ${flatType.toLowerCase()} sales in ${year}`;
    layer.bindTooltip(label, { sticky: true });
    if (t) layer.on('click', () => openBlocks(t.town));
  }

  const townStyle = (feature) => {
    const isSelected = feature.properties.town === selected;
    return {
      fillColor: townColor(townMap[feature.properties.town]),
      fillOpacity: 0.65,
      color: isSelected ? '#1f1a1a' : '#ffffff',
      weight: isSelected ? 3 : 1,
    };
  };

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-dialog" role="dialog" aria-label="Affordability heat map" onClick={(e) => e.stopPropagation()}>
        <div className="map-header">
          <div>
            <h3>
              {view === 'island' ? `${flatType.toLowerCase()} flats across Singapore` : `${titleCase(selected)} blocks`}
            </h3>
            <p className="muted">
              {view === 'island'
                ? `Coloured by how many ${year} sales were within your ${money(budget)} budget. Click a town to see its blocks.`
                : `${flatType.toLowerCase()} blocks sold in ${year}, coloured by median price against your ${money(budget)} budget.`}
            </p>
          </div>
          <div className="map-actions">
            {view === 'blocks' && <button className="btn-outline" onClick={() => setView('island')}>← All towns</button>}
            <button className="btn-ghost map-close" onClick={onClose} aria-label="Close map">✕</button>
          </div>
        </div>

        {error && <p className="alert alert-error">{error}</p>}

        <div className="map-frame">
          {boundaries && (
            <MapContainer center={[1.3521, 103.8198]} zoom={11} minZoom={11} maxZoom={18} scrollWheelZoom className="map">
              <TileLayer url="https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png" attribution={ONEMAP_ATTRIBUTION} />

              {view === 'island' ? (
                <GeoJSON key={`island-${selected}`} data={boundaries} style={townStyle} onEachFeature={onEachTown} />
              ) : (
                <GeoJSON
                  key={`outline-${selected}`}
                  data={{ type: 'FeatureCollection', features: selectedFeatures }}
                  style={{ color: '#1f1a1a', weight: 2, fillOpacity: 0.04 }}
                  interactive={false}
                />
              )}

              {view === 'blocks' && blocks?.blocks.map((b) => (
                <CircleMarker
                  key={`${b.block} ${b.street}`}
                  center={[b.lat, b.lng]}
                  radius={6 + Math.min(b.transactions, 6)}
                  pathOptions={{ color: '#ffffff', weight: 1, fillColor: blockColor(b.median_price, budget), fillOpacity: 0.9 }}
                >
                  <Tooltip>
                    <strong>Blk {b.block} {titleCase(b.street)}</strong><br />
                    Median {money(b.median_price)} · {b.transactions} sale{b.transactions > 1 ? 's' : ''}
                  </Tooltip>
                </CircleMarker>
              ))}

              {/* Whole island for comparing towns, zoomed in on the town for its blocks */}
              <FitTo features={view === 'island' ? boundaries.features : selectedFeatures} />
            </MapContainer>
          )}
        </div>

        <div className="map-footer">
          <Legend view={view} />
          {view === 'island' && info && (
            <button onClick={() => openBlocks(selected)}>See blocks in {titleCase(selected)}</button>
          )}
          {view === 'blocks' && blocks && (
            <span className="muted">
              {blocks.blocks.length < blocks.total
                ? `Showing ${blocks.blocks.length} of ${blocks.total} blocks (the rest are still being located)`
                : `${blocks.total} blocks · bigger dots had more sales`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
