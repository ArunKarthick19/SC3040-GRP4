import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import TownHeatMap from '../components/TownHeatMap';

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

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/buyer/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monthly_income: Number(form.monthly_income),
          cash_savings: Number(form.cash_savings),
          cpf_oa: Number(form.cpf_oa),
          age: Number(form.age),
          other_debts: Number(form.other_debts || 0),
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setResult({ ...(await res.json()), flatType: form.flat_type });
    } catch (err) {
      setError(`Could not get results. Is the backend running? (${err.message})`);
    } finally {
      setLoading(false);
    }
  }

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
                    {FLAT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
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
                <button type="submit" disabled={loading}>{loading ? 'Calculating...' : 'Show my options'}</button>
              </div>
            </form>

            <div className="buyer-results">
              {!result ? (
                <div className="panel muted">Fill in your details to see your loan options and budget.</div>
              ) : (
                <>
                  <div className="panel budget-panel">
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
                        <button
                          type="button"
                          className="btn-outline"
                          // Open on the best match, or any town that sold this flat type
                          onClick={() => setMapTown(result.locations?.[0]?.town ?? Object.keys(result.town_map)[0])}
                        >
                          View map
                        </button>
                      )}
                    </div>
                    <Locations locations={result.locations} flatType={result.flatType} budget={result.budget} year={result.locations_year} onSelect={setMapTown} />
                  </div>
                  <p className="fine-print">
                    Estimates only. Bank loan assumes a 3.0% interest rate; your eligibility is assessed at the
                    stress-test rates set by HDB (3%) and MAS (4%). Stamp duty, legal fees and grants are not included.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {mapTown && result?.town_map && (
        <TownHeatMap
          town={mapTown}
          flatType={result.flatType}
          budget={result.budget}
          townMap={result.town_map}
          year={result.locations_year}
          onClose={() => setMapTown(null)}
        />
      )}
    </>
  );
}
