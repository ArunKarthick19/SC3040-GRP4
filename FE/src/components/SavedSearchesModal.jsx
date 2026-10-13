import { useEffect } from 'react';

const savedOn = (iso) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

// Modal listing the buyer's saved searches; picking one re-runs it
export default function SavedSearchesModal({ searches, onPick, onDelete, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="modal-dialog" role="dialog" aria-label="Saved searches" onClick={(e) => e.stopPropagation()}>
        <div className="map-header">
          <div>
            <h3>Saved searches</h3>
            <p className="muted">Pick one to fill in the form and see its results.</p>
          </div>
          <button type="button" className="btn-ghost map-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {searches.length === 0 ? (
          <p className="muted">
            No saved searches yet. Fill in the form and click "Save this search" to keep one for later.
          </p>
        ) : (
          <ul className="saved-list modal-list">
            {searches.map((s) => (
              <li key={s.id}>
                <button type="button" className="saved-pick" onClick={() => onPick(s)}>
                  <strong>{s.name}</strong>
                  <span className="muted">Saved {savedOn(s.created_at)}</span>
                </button>
                <button type="button" className="btn-ghost" onClick={() => onDelete(s.id)} aria-label={`Delete ${s.name}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
