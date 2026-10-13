import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ONEMAP_ATTRIBUTION, distance } from '../mrtLines';
import { BlockCard, NearestLines } from './TownHeatMap';

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const money = (n) => `$${Math.round(n).toLocaleString('en-SG')}`;

// Zooms to the focused flat and its nearest stops, or to all saved flats
function FitTo({ flats, focus }) {
  const map = useMap();
  useEffect(() => {
    const points = focus
      ? [[focus.lat, focus.lng], ...[focus.nearest_mrt, focus.nearest_bus].filter(Boolean).map((p) => [p.lat, p.lng])]
      : flats.map((f) => [f.lat, f.lng]);
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 17 });
  }, [map, flats, focus]);
  return null;
}

// The buyer's bookmarked flats on a map (about 3/4 of the dialog) beside a scrollable list of them,
// from the details saved with each one (no search needed). focusId (optional): the flat to open on, pinned.
export default function SavedFlatsMap({ bookmarks, focusId, onRemove, onClose }) {
  const flats = bookmarks.filter((b) => b.lat != null && b.lng != null);
  const [pinned, setPinned] = useState(() => flats.find((f) => f.id === focusId) ?? null);
  const [hovered, setHovered] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(pinned); // flat to zoom to: on open, then whenever one is picked from the list
  const shown = hovered ?? pinned;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pick(flat) {
    setPinned(flat);
    setFocus(flat);
  }

  async function remove() {
    setRemoving(true);
    setError('');
    try {
      await onRemove(pinned.id);
      setPinned(null);
      setFocus(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-dialog map-dialog-wide" role="dialog" aria-label="Saved flats map" onClick={(e) => e.stopPropagation()}>
        <div className="map-header">
          <div>
            <h3>Your saved flats</h3>
            <p className="muted">
              {flats.length} saved flat{flats.length === 1 ? '' : 's'}. Pick one from the list, or hover or click one on the map,
              to see its nearest MRT and bus stop.
            </p>
          </div>
          <div className="map-actions">
            <button className="btn-ghost map-close" onClick={onClose} aria-label="Close map">✕</button>
          </div>
        </div>

        {error && <p className="alert alert-error">{error}</p>}

        <div className="saved-map-layout">
          <div className="map-frame">
            {shown && (
              <BlockCard
                block={shown}
                subtitle={`${titleCase(shown.town)} · ${shown.flat_type.toLowerCase()}${shown.data_year ? ` · ${shown.data_year} sales` : ''}`}
                pinned={shown === pinned}
                saved
                saving={removing}
                onToggleSave={remove}
                onClose={() => setPinned(null)}
              />
            )}
            <MapContainer center={[1.3521, 103.8198]} zoom={12} scrollWheelZoom className="map">
              <TileLayer url="https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png" attribution={ONEMAP_ATTRIBUTION} />
              {shown?.nearest_mrt && <NearestLines block={shown} />}
              {flats.map((f) => (
                <CircleMarker
                  key={f.id}
                  center={[f.lat, f.lng]}
                  radius={9}
                  pathOptions={{
                    color: f === pinned || f === hovered ? '#1f1a1a' : '#ffffff',
                    weight: f === pinned ? 4 : f === hovered ? 3 : 2,
                    fillColor: '#e6564c',
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{
                    mouseover: () => setHovered(f),
                    mouseout: () => setHovered(null),
                    click: () => setPinned(f),
                  }}
                />
              ))}
              <FitTo flats={flats} focus={focus} />
            </MapContainer>
          </div>

          <ul className="saved-map-list">
            {flats.length === 0 && (
              <li className="muted">No saved flats yet. On a town's blocks map, click a block and choose "Save flat".</li>
            )}
            {flats.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className={`saved-pick${f === pinned ? ' saved-pick-active' : ''}`}
                  onClick={() => pick(f)}
                  onMouseEnter={() => setHovered(f)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <strong>Blk {f.block} {titleCase(f.street)}</strong>
                  <span className="muted">{titleCase(f.town)} · {f.flat_type.toLowerCase()}</span>
                  {f.median_price && <span className="muted">Median {money(f.median_price)}</span>}
                  {f.nearest_mrt && <span className="muted">{f.nearest_mrt.name} {distance(f.nearest_mrt.distance_m)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
