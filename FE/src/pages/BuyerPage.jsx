import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import TownHeatMap from '../components/TownHeatMap';
import { scrollToElement } from '../scroll';
import SavedPanel from '../components/SavedPanel';
import SavedFlatsMap from '../components/SavedFlatsMap';
import SavedSearchesModal from '../components/SavedSearchesModal';
import {
  blockKey, deleteBookmark, deleteSearch, listBookmarks, listSearches, saveBookmark, saveSearch,
} from '../saves';

const FLAT_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE'];

const money = (n) => `$${Math.round(n).toLocaleString('en-SG')}`;

function LoanCard({ title, loan, highlight }) {
  if (!loan.eligible) {
    return (
      <article className="loan-card">
        <h3>{title}</h3>
        <p className="loan-ineligible">Not eligible: {loan.reason}</p>
      </article>
    );
  }

  return (
    <article className={`loan-card${highlight ? ' loan-card-best' : ''}`}>
      <div className="loan-card-head">
        <h3>{title}</h3>
        {highlight && <span className="tag tag-success">Higher budget</span>}
      </div>
      <div className="loan-amount">{money(loan.max_loan)}</div>
      <div className="loan-sub">Maximum loan</div>
      <ul className="stat-list">
        <li>Monthly instalment <strong>{money(loan.monthly_instalment)}</strong></li>
        <li>Loan tenure <strong>{loan.tenure_years} years</strong></li>
        <li>Interest rate <strong>{(loan.interest_rate * 100).toFixed(1)}% p.a.</strong></li>
        <li>Total interest paid <strong>{money(loan.total_interest)}</strong></li>
        <li>Max flat price <strong>{money(loan.max_purchase_price)}</strong></li>
        <li>Downpayment (cash + CPF) <strong>{money(loan.downpayment)}</strong></li>
      </ul>
    </article>
  );
}

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function Locations({ locations, flatType, budget, year, onSelect }) {
  if (locations === null) {
    return (
      <p className="muted">
        Town recommendations will appear here once the HDB resale price model is trained.
      </p>
    );
  }
  if (locations.length === 0) {
    return (
      <p className="muted">
        Fewer than 1 in 10 {flatType.toLowerCase()} flats sold in {year} in any town were within {money(budget)}.
        Try a smaller flat type.
      </p>
    );
  }
  return (
    <>
      <p className="muted">
        Based on {flatType.toLowerCase()} resale flats sold in {year}. Towns where more of the flats sold were
        within your budget are listed first. Click a town to see it on the map.
      </p>
      <ul className="town-list">
        {locations.map((loc) => (
          <li key={loc.town}>
            <button type="button" className="town-item" onClick={() => onSelect(loc.town)}>
              <span className="town-row">
                <strong>{titleCase(loc.town)}</strong>
                <span className="town-share">{Math.round(loc.share_within_budget * 100)}% in budget</span>
              </span>
              <span className="town-bar"><span style={{ width: `${loc.share_within_budget * 100}%` }} /></span>
              <span className="town-meta">
                Median {money(loc.estimated_price)} · ~{loc.typical_floor_area} sqm · ~{loc.typical_remaining_lease} yrs
                lease left · {loc.transactions} sales
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const flatTypeName = (t) => t.charAt(0) + t.slice(1).toLowerCase();

const MIN_TOWNS_TO_SUGGEST = 5; // the map opens on the biggest flat type that fits in at least this many towns

// Flat types the budget covers (smallest first), each with labels, plus which one the map should open on.
// Returns null when no flat type fits.
function labelSuggestions(flatTypes, preferred) {
  const fits = flatTypes?.filter((s) => s.towns > 0) ?? [];
  if (fits.length === 0) return null;

  const mostSpace = fits[fits.length - 1];
  // On a tie, the bigger flat type wins
  const mostChoice = fits.reduce((best, s) => (s.towns >= best.towns ? s : best));
  const start = [...fits].reverse().find((s) => s.towns >= MIN_TOWNS_TO_SUGGEST) ?? mostSpace;

  const options = fits.map((s) => ({
    ...s,
    labels: [
      s === mostSpace && 'Most space',
      s === mostChoice && 'Most choice',
      s.flat_type === preferred && 'Your choice',
    ].filter(Boolean),
  }));
  return { options, start: start.flat_type };
}

export default function BuyerPage({ session }) {
  const [form, setForm] = useState({
    monthly_income: '',
    cash_savings: '',
    cpf_oa: '',
    age: '',
    flat_type: '4 ROOM',
    other_debts: '0',
    applicant_type: 'family',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapTown, setMapTown] = useState(null);
  const [mapSuggest, setMapSuggest] = useState(false); // map opened from "Suggested flat types"
  const [mapType, setMapType] = useState(null); // flat type the map opens on
  const [savedMap, setSavedMap] = useState(null); // { focusId } while the saved flats map is open
  const [searchesOpen, setSearchesOpen] = useState(false); // saved searches modal
  const [searches, setSearches] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [savesError, setSavesError] = useState('');
  const [saveNote, setSaveNote] = useState('');

  useEffect(() => {
    Promise.all([listSearches(), listBookmarks()])
      .then(([s, b]) => {
        setSearches(s);
        setBookmarks(b);
      })
      .catch((err) => setSavesError(err.message));
  }, []);

  const savedKeys = useMemo(() => new Set(bookmarks.map(blockKey)), [bookmarks]);
  const resultsRef = useRef(null);

  // Bring the results into view each time new ones arrive
  useEffect(() => {
    if (result && resultsRef.current) scrollToElement(resultsRef.current, 500);
  }, [result]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function getResults(values) {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/buyer/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          monthly_income: Number(values.monthly_income),
          cash_savings: Number(values.cash_savings),
          cpf_oa: Number(values.cpf_oa),
          age: Number(values.age),
          other_debts: Number(values.other_debts || 0),
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setResult({ ...(await res.json()), flatType: values.flat_type });
    } catch (err) {
      setError(`Could not get results. Is the backend running? (${err.message})`);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    getResults(form);
  }

  async function handleSaveSearch() {
    setSaveNote('');
    if (!form.monthly_income || !form.cash_savings || !form.cpf_oa || !form.age) {
      setSaveNote('Fill in your income, savings, CPF and age first.');
      return;
    }
    if (searches.some((s) => JSON.stringify(s.criteria) === JSON.stringify(form))) {
      setSaveNote('This search is already saved.');
      return;
    }
    const name = `${flatTypeName(form.flat_type)} · ${money(form.monthly_income)}/mo · ${money(form.cash_savings)} cash · ` +
      `${money(form.cpf_oa)} CPF · age ${form.age}`;
    try {
      const saved = await saveSearch(name, form);
      setSearches([saved, ...searches]);
      setSaveNote('Search saved. Find it under "Saved" at the bottom of the page.');
    } catch (err) {
      setSaveNote(err.message);
    }
  }

  function loadSearch(search) {
    setForm(search.criteria);
    getResults(search.criteria);
  }

  async function removeSearch(id) {
    try {
      await deleteSearch(id);
      setSearches(searches.filter((s) => s.id !== id));
    } catch (err) {
      setSavesError(err.message);
    }
  }

  async function addBookmark(block, town, flatType) {
    const saved = await saveBookmark(block, town, flatType, result.locations_year);
    setBookmarks((list) => [saved, ...list]);
  }

  async function removeBookmark(id) {
    try {
      await deleteBookmark(id);
      setBookmarks((list) => list.filter((b) => b.id !== id));
    } catch (err) {
      setSavesError(err.message);
    }
  }

  async function removeBookmarkByKey(key) {
    const bookmark = bookmarks.find((b) => blockKey(b) === key);
    if (!bookmark) return;
    await deleteBookmark(bookmark.id);
    setBookmarks((list) => list.filter((b) => b.id !== bookmark.id));
  }

  // Opens the map on the best match, or any town that sold this flat type.
  // From "Suggested flat types" it opens on the suggested type instead of the user's choice.
  function openMap(suggest) {
    setMapSuggest(suggest);
    if (suggest && suggestions) {
      const towns = Object.values(result.town_maps[suggestions.start]);
      const best = towns.sort((a, b) => b.share_within_budget - a.share_within_budget || a.estimated_price - b.estimated_price)[0];
      setMapType(suggestions.start);
      setMapTown(best.town);
      return;
    }
    setMapType(result.flatType);
    setMapTown(result.locations?.[0]?.town ?? Object.keys(result.town_map)[0]);
  }

  function selectTown(town) {
    setMapSuggest(false);
    setMapType(result.flatType);
    setMapTown(town);
  }

  const suggestions = labelSuggestions(result?.flat_types, result?.flatType);
  const { hdb_loan: hdb, bank_loan: bank } = result ?? {};
  // Only flag a winner when one loan actually gives a bigger budget
  let best = null;
  if (hdb?.eligible && bank?.eligible && hdb.max_purchase_price !== bank.max_purchase_price) {
    best = hdb.max_purchase_price > bank.max_purchase_price ? 'hdb' : 'bank';
  }

  return (
    <>
      <Navbar session={session} />

      <main className="section section-compact">
        <div className="container">
          <p><Link to="/start">← Back</Link></p>
          <div className="section-head">
            <span className="eyebrow">For buyers</span>
            <h2>What can you afford?</h2>
            <p>Tell us about your finances and we'll work out your loan options and budget.</p>
          </div>

          <div className="buyer-layout">
            <form className="panel buyer-form" onSubmit={handleSubmit}>
              <div>
                <label>
                  Buying as
                  <select value={form.applicant_type} onChange={update('applicant_type')}>
                    <option value="family">Family / couple</option>
                    <option value="single">Single</option>
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Gross monthly household income ($)
                  <input type="number" min="1" step="any" value={form.monthly_income} onChange={update('monthly_income')} required />
                </label>
              </div>
              <div>
                <label>
                  Cash savings ($)
                  <input type="number" min="0" step="any" value={form.cash_savings} onChange={update('cash_savings')} required />
                </label>
              </div>
              <div>
                <label>
                  CPF Ordinary Account balance ($)
                  <input type="number" min="0" step="any" value={form.cpf_oa} onChange={update('cpf_oa')} required />
                </label>
              </div>
              <div>
                <label>
                  Age of oldest buyer
                  <input type="number" min="21" max="100" value={form.age} onChange={update('age')} required />
                </label>
              </div>
              <div>
                <label>
                  Preferred flat type
                  <select value={form.flat_type} onChange={update('flat_type')}>
                    {FLAT_TYPES.map((t) => <option key={t} value={t}>{flatTypeName(t)}</option>)}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Other monthly loan repayments ($)
                  <input type="number" min="0" step="any" value={form.other_debts} onChange={update('other_debts')} />
                </label>
              </div>
              <div className="buyer-form-actions">
                {error && <p className="alert alert-error">{error}</p>}
                {saveNote && !error && <p className="muted save-note">{saveNote}</p>}
                <button type="button" className="btn-ghost" onClick={() => setSearchesOpen(true)}>
                  View saved searches{searches.length > 0 && ` (${searches.length})`}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setSavedMap({ focusId: null })}>
                  View saved flats{bookmarks.length > 0 && ` (${bookmarks.length})`}
                </button>
                <button type="button" className="btn-outline" onClick={handleSaveSearch}>☆ Save this search</button>
                <button type="submit" disabled={loading}>{loading ? 'Calculating...' : 'Show my options'}</button>
              </div>
            </form>

            <div className="buyer-results">
              {!result ? (
                <div className="panel muted">Fill in your details to see your loan options and budget.</div>
              ) : (
                <>
                  <div className="panel budget-panel" ref={resultsRef}>
                    <div className="loan-sub">Your estimated budget</div>
                    <div className="loan-amount">{money(result.budget)}</div>
                    <div className="loan-sub">Highest flat price you can fund with a loan, your cash and CPF</div>
                  </div>
                  <div className="loan-grid">
                    <LoanCard title="HDB loan" loan={hdb} highlight={best === 'hdb'} />
                    <LoanCard title="Bank loan" loan={bank} highlight={best === 'bank'} />
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <h3>Recommended towns</h3>
                      {result.town_map && (
                        <div className="panel-actions">
                          {suggestions && (
                            <button type="button" className="btn-ai" onClick={() => openMap(true)}>
                              <span aria-hidden="true">✦</span> Suggested flat types
                            </button>
                          )}
                          <button type="button" className="btn-outline" onClick={() => openMap(false)}>
                            View map
                          </button>
                        </div>
                      )}
                    </div>
                    <Locations locations={result.locations} flatType={result.flatType} budget={result.budget} year={result.locations_year} onSelect={selectTown} />
                  </div>
                  <p className="fine-print">
                    Estimates only. Bank loan assumes a 3.0% interest rate; your eligibility is assessed at the
                    stress-test rates set by HDB (3%) and MAS (4%). Stamp duty, legal fees and grants are not included.
                  </p>
                </>
              )}
            </div>
          </div>

          <SavedPanel
            bookmarks={bookmarks}
            error={savesError}
            onViewBookmark={(b) => setSavedMap({ focusId: b.id })}
            onViewAllBookmarks={() => setSavedMap({ focusId: null })}
            onDeleteBookmark={removeBookmark}
          />
        </div>
      </main>

      {mapTown && result?.town_map && (
        <TownHeatMap
          town={mapTown}
          flatType={mapType}
          budget={result.budget}
          townMap={result.town_map}
          townMaps={result.town_maps}
          flatTypeOptions={mapSuggest ? suggestions?.options : undefined}
          modelInfo={result.price_model}
          year={result.locations_year}
          savedKeys={savedKeys}
          onSaveBlock={addBookmark}
          onUnsaveBlock={removeBookmarkByKey}
          onClose={() => setMapTown(null)}
        />
      )}

      {searchesOpen && (
        <SavedSearchesModal
          searches={searches}
          onPick={(search) => {
            setSearchesOpen(false);
            loadSearch(search);
          }}
          onDelete={removeSearch}
          onClose={() => setSearchesOpen(false)}
        />
      )}

      {savedMap && (
        <SavedFlatsMap
          bookmarks={bookmarks}
          focusId={savedMap.focusId}
          onRemove={async (id) => {
            await deleteBookmark(id);
            setBookmarks((list) => list.filter((b) => b.id !== id));
          }}
          onClose={() => setSavedMap(null)}
        />
      )}
    </>
  );
}
