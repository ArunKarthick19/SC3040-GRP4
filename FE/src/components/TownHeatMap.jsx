import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ONEMAP_ATTRIBUTION, distance, lineColor } from '../mrtLines';
import { blockKey } from '../saves';

const COLORS = { good: '#2f9e6b', ok: '#f0b429', bad: '#e6564c', none: '#d9d4d3' };

const money = (n) => `$${Math.round(n).toLocaleString('en-SG')}`;
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// URA's five regions, by HDB town
const REGIONS = {
  North: ['SEMBAWANG', 'WOODLANDS', 'YISHUN'],
  'North-East': ['ANG MO KIO', 'HOUGANG', 'PUNGGOL', 'SENGKANG', 'SERANGOON'],
  East: ['BEDOK', 'PASIR RIS', 'TAMPINES'],
  West: ['BUKIT BATOK', 'BUKIT PANJANG', 'CHOA CHU KANG', 'CLEMENTI', 'JURONG EAST', 'JURONG WEST'],
  Central: [
    'BISHAN', 'BUKIT MERAH', 'BUKIT TIMAH', 'CENTRAL AREA', 'GEYLANG',
    'KALLANG/WHAMPOA', 'MARINE PARADE', 'QUEENSTOWN', 'TOA PAYOH',
  ],
};

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

function FitTo({ features }) {
  const map = useMap();
  useEffect(() => {
    if (features?.length) map.fitBounds(L.geoJSON(features).getBounds(), { padding: [24, 24] });
  }, [map, features]);
  return null;
}

// Fixed card in the map's corner with the hovered block's details (a floating tooltip would cover the lines)
// subtitle (optional): extra line under the address, e.g. town and flat type
export function BlockCard({ block, subtitle, pinned, saved, saving, onToggleSave, onClose }) {
  const mrt = block.nearest_mrt;
  const bus = block.nearest_bus;
  return (
    <div className={`map-hover-card${pinned ? ' map-hover-card-pinned' : ''}`}>
      <div className="map-hover-head">
        <strong>Blk {block.block} {titleCase(block.street)}</strong>
        {pinned && <button type="button" className="btn-ghost map-hover-close" onClick={onClose} aria-label="Unpin">✕</button>}
      </div>
      {subtitle && <span className="muted">{subtitle}</span>}
      <span className="muted">
        Median {money(block.median_price)} · {block.transactions} sale{block.transactions > 1 ? 's' : ''}
      </span>
      {mrt && (
        <ul>
          <li>
            <span className="map-hover-swatch" style={{ background: lineColor(mrt.codes[0]) }} />
            <span>
              {mrt.name} ({mrt.codes.join('/')})<br />
              <strong>{distance(mrt.distance_m)}</strong> · ~{mrt.walk_min} min walk
            </span>
          </li>
          <li>
            <span className="map-hover-swatch map-hover-swatch-bus" />
            <span>
              Bus stop {bus.code}{bus.road && ` · ${bus.road}`}<br />
              <strong>{distance(bus.distance_m)}</strong> · ~{bus.walk_min} min walk
            </span>
          </li>
        </ul>
      )}
      {pinned && onToggleSave ? (
        <button type="button" className={saved ? 'btn-outline' : ''} onClick={onToggleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? '★ Saved · remove' : '☆ Save flat'}
        </button>
      ) : (
        onToggleSave && <span className="muted map-hover-hint">{saved ? '★ Saved · ' : ''}Click the block to pin it and save</span>
      )}
    </div>
  );
}

// Straight lines from a block to its nearest MRT/LRT station (in the line's colour) and bus stop (dashed)
export function NearestLines({ block }) {
  const mrt = block.nearest_mrt;
  const bus = block.nearest_bus;
  const color = lineColor(mrt.codes[0]);
  const from = [block.lat, block.lng];
  // Labels go on the far side of each stop, clear of the block's own tooltip above it
  const side = (place) => (place.lng < block.lng ? 'left' : 'right');
  const offset = (place) => [place.lng < block.lng ? -8 : 8, 0];
  return (
    <>
      <Polyline positions={[from, [mrt.lat, mrt.lng]]} pathOptions={{ color, weight: 4, opacity: 0.9 }} interactive={false} />
      <Polyline
        positions={[from, [bus.lat, bus.lng]]}
        pathOptions={{ color: '#1f1a1a', weight: 2.5, dashArray: '4 6' }}
        interactive={false}
      />
      <CircleMarker
        center={[mrt.lat, mrt.lng]}
        radius={8}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 }}
        interactive={false}
      >
        <Tooltip permanent direction={side(mrt)} offset={offset(mrt)} className="nearest-label">
          {mrt.name} · {distance(mrt.distance_m)}
        </Tooltip>
      </CircleMarker>
      <CircleMarker
        center={[bus.lat, bus.lng]}
        radius={6}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#1f1a1a', fillOpacity: 1 }}
        interactive={false}
      >
        <Tooltip permanent direction={side(bus)} offset={offset(bus)} className="nearest-label">
          Bus {bus.code} · {distance(bus.distance_m)}
        </Tooltip>
      </CircleMarker>
    </>
  );
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

// flatTypeOptions (optional): flat types to switch between, shown as chips; needs townMaps for each of them.
// modelInfo (optional): price model accuracy, shown as a note on where the suggestions come from.
// savedKeys / onSaveBlock / onUnsaveBlock (optional): bookmarking blocks; savedKeys is a Set of blockKey()s.
export default function TownHeatMap({
  town, flatType, budget, townMap: chosenTownMap, townMaps, flatTypeOptions, modelInfo, year, onClose,
  savedKeys, onSaveBlock, onUnsaveBlock,
}) {
  const [boundaries, setBoundaries] = useState(null);
  const [selected, setSelected] = useState(town);
  const [view, setView] = useState('island');
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState(flatType);
  const [region, setRegion] = useState(null); // zoomed-in region
  const [hoverRegion, setHoverRegion] = useState(null);
  const [hoverBlock, setHoverBlock] = useState(null); // block whose nearest MRT / bus stop is drawn
  const [pinnedBlock, setPinnedBlock] = useState(null); // clicked block, which stays shown and can be saved
  const [saving, setSaving] = useState(false);
  const shownBlock = hoverBlock ?? pinnedBlock;
  const keyOf = (b) => blockKey({ ...b, flat_type: activeType });

  const townMap = townMaps?.[activeType] ?? chosenTownMap;
  // Towns to emphasise: the hovered region, else the zoomed one
  const focusTowns = REGIONS[hoverRegion ?? region];

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
    const params = new URLSearchParams({ town: selected, flat_type: activeType });
    fetch(`${import.meta.env.VITE_API_URL}/api/buyer/town-blocks?${params}`)
      .then((res) => res.json())
      .then(setBlocks)
      .catch(() => setError('Could not load blocks for this town.'));
  }, [view, selected, activeType]);

  const selectedFeatures = useMemo(
    () => boundaries?.features.filter((f) => f.properties.town === selected),
    [boundaries, selected],
  );
  const regionFeatures = useMemo(
    () => region && boundaries?.features.filter((f) => REGIONS[region].includes(f.properties.town)),
    [boundaries, region],
  );
  const regionTowns = region ? REGIONS[region].filter((t) => townMap[t]) : [];
  const regionFits = regionTowns.filter((t) => townMap[t].share_within_budget >= 0.1);

  function pickType(type) {
    setBlocks(null);
    setHoverBlock(null);
    setPinnedBlock(null);
    setActiveType(type);
  }
  const info = townMap[selected];

  function openBlocks(name) {
    setBlocks(null);
    setHoverBlock(null);
    setPinnedBlock(null);
    setSelected(name);
    setView('blocks');
  }

  async function toggleSave() {
    setSaving(true);
    setError('');
    try {
      if (savedKeys.has(keyOf(pinnedBlock))) await onUnsaveBlock(keyOf(pinnedBlock));
      else await onSaveBlock(pinnedBlock, selected, activeType);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function onEachTown(feature, layer) {
    const t = townMap[feature.properties.town];
    const label = t
      ? `<strong>${titleCase(t.town)}</strong><br/>${Math.round(t.share_within_budget * 100)}% in budget · median ${money(t.estimated_price)}<br/><em>Click to see blocks</em>`
      : `<strong>${titleCase(feature.properties.area)}</strong><br/>No ${activeType.toLowerCase()} sales in ${year}`;
    layer.bindTooltip(label, { sticky: true });
    if (t) layer.on('click', () => openBlocks(t.town));
  }

  const townStyle = (feature) => {
    const isSelected = feature.properties.town === selected;
    const inFocus = focusTowns?.includes(feature.properties.town);
    return {
      fillColor: townColor(townMap[feature.properties.town]),
      // Fade towns outside the hovered/zoomed region
      fillOpacity: focusTowns && !inFocus ? 0.15 : 0.65,
      color: inFocus && hoverRegion ? '#1f1a1a' : isSelected && !focusTowns ? '#1f1a1a' : '#ffffff',
      weight: (inFocus && hoverRegion) || (isSelected && !focusTowns) ? 2.5 : 1,
    };
  };

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-dialog" role="dialog" aria-label="Affordability heat map" onClick={(e) => e.stopPropagation()}>
        <div className="map-header">
          <div>
            <h3>
              {view === 'island'
                ? `${activeType.toLowerCase()} flats ${region ? `in the ${region}` : 'across Singapore'}`
                : `${titleCase(selected)} blocks`}
            </h3>
            <p className="muted">
              {view === 'island'
                ? `Coloured by how many ${year} sales were within your ${money(budget)} budget. Click a town to see its blocks.`
                : `${activeType.toLowerCase()} blocks sold in ${year}, coloured by median price against your ${money(budget)} budget.`}
            </p>
          </div>
          <div className="map-actions">
            {view === 'blocks' && <button className="btn-outline" onClick={() => setView('island')}>← All towns</button>}
            <button className="btn-ghost map-close" onClick={onClose} aria-label="Close map">✕</button>
          </div>
        </div>

        {error && <p className="alert alert-error">{error}</p>}

        {flatTypeOptions?.length > 0 && modelInfo && (
          <p className="model-note">
            <span aria-hidden="true">✦</span> Flat types suggested by our machine learning price model, trained on{' '}
            {modelInfo.total_sales.toLocaleString('en-SG')} HDB resale sales since 2017 (typical error {modelInfo.mape}%).
            A flat type fits a town when a typical flat there is predicted to be within your budget.
          </p>
        )}

        <div className="map-toolbar">
          {flatTypeOptions?.length > 0 && (
            <div className="chip-group" aria-label="Flat type">
              {flatTypeOptions.map((s) => (
                <button
                  key={s.flat_type}
                  type="button"
                  className={`chip${s.flat_type === activeType ? ' chip-active' : ''}`}
                  onClick={() => pickType(s.flat_type)}
                >
                  {s.flat_type.charAt(0) + s.flat_type.slice(1).toLowerCase()}
                  <span className="chip-count">{s.towns}</span>
                  {s.labels?.map((label) => <span key={label} className="chip-label">{label}</span>)}
                </button>
              ))}
            </div>
          )}
          {view === 'island' && (
            <div className="chip-group" aria-label="Region" onMouseLeave={() => setHoverRegion(null)}>
              <button type="button" className={`chip${!region ? ' chip-active' : ''}`} onClick={() => setRegion(null)}>
                All
              </button>
              {Object.keys(REGIONS).map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`chip${region === name ? ' chip-active' : ''}`}
                  onMouseEnter={() => setHoverRegion(name)}
                  onFocus={() => setHoverRegion(name)}
                  onBlur={() => setHoverRegion(null)}
                  onClick={() => setRegion(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="map-frame">
          {view === 'blocks' && shownBlock && (
            <BlockCard
              block={shownBlock}
              pinned={shownBlock === pinnedBlock}
              saved={savedKeys?.has(keyOf(shownBlock))}
              saving={saving}
              onToggleSave={onSaveBlock && toggleSave}
              onClose={() => setPinnedBlock(null)}
            />
          )}
          {boundaries && (
            <MapContainer center={[1.3521, 103.8198]} zoom={11} minZoom={11} maxZoom={18} scrollWheelZoom className="map">
              <TileLayer url="https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png" attribution={ONEMAP_ATTRIBUTION} />

              {view === 'island' ? (
                // The key forces a redraw, since GeoJSON doesn't re-apply styles or tooltips on its own
                <GeoJSON
                  key={`island-${selected}-${activeType}-${region}-${hoverRegion}`}
                  data={boundaries}
                  style={townStyle}
                  onEachFeature={onEachTown}
                />
              ) : (
                <GeoJSON
                  key={`outline-${selected}`}
                  data={{ type: 'FeatureCollection', features: selectedFeatures }}
                  style={{ color: '#1f1a1a', weight: 2, fillOpacity: 0.04 }}
                  interactive={false}
                />
              )}

              {/* Lines from the hovered block to its nearest MRT and bus stop, drawn under the block dots */}
              {view === 'blocks' && shownBlock?.nearest_mrt && (
                <NearestLines block={shownBlock} />
              )}

              {view === 'blocks' && blocks?.blocks.map((b) => (
                <CircleMarker
                  key={`${b.block} ${b.street}`}
                  center={[b.lat, b.lng]}
                  radius={6 + Math.min(b.transactions, 6)}
                  // Saved and pinned blocks get a dark outline
                  pathOptions={{
                    color: b === pinnedBlock || savedKeys?.has(keyOf(b)) ? '#1f1a1a' : '#ffffff',
                    weight: b === pinnedBlock ? 4 : savedKeys?.has(keyOf(b)) ? 3 : 1,
                    fillColor: blockColor(b.median_price, budget),
                    fillOpacity: 0.9,
                  }}
                  eventHandlers={{
                    mouseover: () => setHoverBlock(b),
                    mouseout: () => setHoverBlock(null),
                    click: () => setPinnedBlock(b), // also how touch screens see the details
                  }}
                />
              ))}

              {/* Whole island for comparing towns, zoomed in on the town for its blocks */}
              <FitTo features={view === 'island' ? regionFeatures || boundaries.features : selectedFeatures} />
            </MapContainer>
          )}
        </div>

        <div className="map-footer">
          <Legend view={view} />
          {view === 'island' && region && (
            <span className="muted">
              {regionFits.length} of {regionTowns.length} {region} towns fit your budget
              {regionFits.length > 0 && `: ${regionFits.map(titleCase).join(', ')}`}
            </span>
          )}
          {view === 'island' && !region && info && (
            <button onClick={() => openBlocks(selected)}>See blocks in {titleCase(selected)}</button>
          )}
          {view === 'blocks' && blocks && (
            <span className="muted">
              {blocks.blocks.length < blocks.total
                ? `Showing ${blocks.blocks.length} of ${blocks.total} blocks (the rest are still being located)`
                : `${blocks.total} blocks · bigger dots had more sales`}
              {' · hover a block for its nearest MRT and bus stop, click to pin it'}{savedKeys && ' and save it (saved: dark outline)'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
