import { cbdDistance, distance } from '../mrtLines';

const money = (n) => `$${Math.round(n).toLocaleString('en-SG')}`;
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// The buyer's bookmarked flats, with buttons to view them on a map or delete them (saved searches have their own modal)
export default function SavedPanel({
  bookmarks, error, onViewBookmark, onViewAllBookmarks, onDeleteBookmark,
}) {
  return (
    <div className="panel saved-panel">
      <div>
        <div className="saved-head">
          <h3>Saved flats ({bookmarks.length})</h3>
          {bookmarks.length > 1 && (
            <button type="button" className="btn-ghost saved-view-all" onClick={onViewAllBookmarks}>View all on map</button>
          )}
        </div>
        {error && <p className="alert alert-error">{error}</p>}
        {bookmarks.length === 0 ? (
          <p className="muted">On the map, open a town's blocks, click a block and choose "Save flat".</p>
        ) : (
          <ul className="saved-list">
            {bookmarks.map((b) => (
              <li key={b.id}>
                <div>
                  <strong>Blk {b.block} {titleCase(b.street)}</strong>
                  <span className="muted">
                    {titleCase(b.town)} · {b.flat_type.toLowerCase()}
                    {b.median_price && ` · typical price ${money(b.median_price)}`}
                  </span>
                  {b.nearest_mrt && (
                    <span className="muted">
                      {b.nearest_mrt.name} {distance(b.nearest_mrt.distance_m)} · bus stop {distance(b.nearest_bus.distance_m)}
                      {b.lat != null && ` · CBD ${distance(cbdDistance(b.lat, b.lng))}`}
                    </span>
                  )}
                </div>
                <div className="saved-actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => onViewBookmark(b)}
                  >
                    View on map
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => onDeleteBookmark(b.id)}
                    aria-label={`Delete Blk ${b.block} ${b.street}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
