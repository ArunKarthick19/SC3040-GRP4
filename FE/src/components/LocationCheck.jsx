import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { distance, lineColor } from '../mrtLines';
import { API_URL } from '../api';

const MARKERS = {
  home: { color: '#ffffff', fillColor: '#e6564c', radius: 10 },
  mrt: { color: '#ffffff', fillColor: '#005ec4', radius: 8 },
  bus: { color: '#ffffff', fillColor: '#6b6262', radius: 6 },
};

const ONEMAP_ATTRIBUTION =
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

function FitTo({ points }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 17 });
  }, [map, points]);
  return null;
}

function PlaceList({ title, places, render }) {
  return (
    <div>
      <h4 className="place-list-title">{title}</h4>
      <ul className="place-list">
        {places.map((p, i) => (
          <li key={i}>
            <span>{render(p)}</span>
            <span className="place-distance">
              <strong>{distance(p.distance_m)}</strong>
              <span className="muted">~{p.walk_min} min walk</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LocationCheck() {
  const [form, setForm] = useState({ postal: '', block: '', street: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.postal.trim() && !(form.block.trim() && form.street.trim())) {
      setError('Enter a postal code, or a block and street name.');
      return;
    }
    setLoading(true);
    try {
      // A postal code is the most precise, so it wins if both are filled in
      const params = new URLSearchParams(
        form.postal.trim() ? { postal: form.postal } : { block: form.block, street: form.street },
      );
      const res = await fetch(`${API_URL}/api/location?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `Server returned ${res.status}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err.message === 'Failed to fetch' ? 'Could not reach the server. Is the backend running?' : err.message);
    } finally {
      setLoading(false);
    }
  }

  const points = result && [
    [result.lat, result.lng],
    ...result.mrt.map((s) => [s.lat, s.lng]),
    ...result.bus_stops.map((s) => [s.lat, s.lng]),
  ];

  return (
    <div className="panel location-check">
      <h3>Check a location</h3>
      <p className="muted">
        Looking at a particular flat? Enter its postal code, or block and street, to see the nearest MRT stations and bus
        stops.
      </p>

      <form className="buyer-form" onSubmit={handleSubmit}>
        <div>
          <label>
            Postal code
            <input inputMode="numeric" maxLength={6} value={form.postal} onChange={update('postal')} placeholder="530910" />
          </label>
        </div>
        <div>
          <label>
            or Block
            <input value={form.block} onChange={update('block')} placeholder="910" />
          </label>
        </div>
        <div className="field-span-2">
          <label>
            and Street name
            <input value={form.street} onChange={update('street')} placeholder="Hougang Street 91" />
          </label>
        </div>
        <div className="buyer-form-actions">
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Looking up...' : 'Check location'}</button>
        </div>
      </form>

      {result && (
        <div className="location-result">
          <div className="location-details">
            <div>
              <div className="loan-sub">Location found</div>
              <div className="location-address">{result.address}</div>
            </div>
            <PlaceList
              title="Nearest MRT / LRT"
              places={result.mrt}
              render={(s) => (
                <>
                  <strong>{s.name}</strong>{' '}
                  {s.codes.map((c) => (
                    <span key={c} className="line-code" style={{ background: lineColor(c) }}>{c}</span>
                  ))}
                </>
              )}
            />
            <PlaceList
              title="Nearest bus stops"
              places={result.bus_stops}
              render={(s) => (
                <>
                  <strong>{s.code}</strong> {s.road && <span className="muted">{s.road}</span>}
                </>
              )}
            />
            <p className="fine-print">Straight-line distances. Walking times are estimates.</p>
          </div>

          <MapContainer key={`${result.lat},${result.lng}`} center={[result.lat, result.lng]} zoom={16} scrollWheelZoom className="location-map">
            <TileLayer url="https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png" attribution={ONEMAP_ATTRIBUTION} />
            {result.bus_stops.map((s) => (
              <CircleMarker key={s.code} center={[s.lat, s.lng]} radius={MARKERS.bus.radius} pathOptions={{ ...MARKERS.bus, weight: 2, fillOpacity: 1 }}>
                <Tooltip>Bus stop {s.code}{s.road && ` · ${s.road}`} · {distance(s.distance_m)}</Tooltip>
              </CircleMarker>
            ))}
            {result.mrt.map((s) => (
              <CircleMarker key={s.name} center={[s.lat, s.lng]} radius={MARKERS.mrt.radius} pathOptions={{ ...MARKERS.mrt, fillColor: lineColor(s.codes[0]), weight: 2, fillOpacity: 1 }}>
                <Tooltip>{s.name} · {distance(s.distance_m)}</Tooltip>
              </CircleMarker>
            ))}
            <CircleMarker center={[result.lat, result.lng]} radius={MARKERS.home.radius} pathOptions={{ ...MARKERS.home, weight: 3, fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -10]}>Blk {result.block}</Tooltip>
            </CircleMarker>
            <FitTo points={points} />
          </MapContainer>
        </div>
      )}
    </div>
  );
}
