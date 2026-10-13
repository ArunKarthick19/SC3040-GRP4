import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { EVENTS, countUsers, isAdmin, listEvents } from '../audit';

const when = (iso) => new Date(iso).toLocaleString('en-SG', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Event details as short "key: value" text, e.g. "town: Tampines · photos: 3"
const describe = (details) => (details
  ? Object.entries(details).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')
  : '');

// Audit trail for admins: usage counts plus a filterable list of recent events.
// Supabase only returns the log to admin accounts (supabase/audit_setup.sql), so this page can't leak it.
export default function AdminPage({ session }) {
  const [allowed, setAllowed] = useState(null); // null while checking
  const [events, setEvents] = useState([]);
  const [registered, setRegistered] = useState(null);
  const [error, setError] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  async function load() {
    setError('');
    try {
      const [list, total] = await Promise.all([listEvents(), countUsers()]);
      setEvents(list);
      setRegistered(total);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    isAdmin().then((ok) => {
      setAllowed(ok);
      if (ok) load();
    });
  }, []);

  const shown = useMemo(() => events.filter((e) => (
    (!eventFilter || e.event === eventFilter)
    && (!userFilter || (e.profiles?.username ?? '').toLowerCase().includes(userFilter.toLowerCase()))
  )), [events, eventFilter, userFilter]);

  const counts = useMemo(() => {
    const byEvent = {};
    for (const e of events) byEvent[e.event] = (byEvent[e.event] ?? 0) + 1;
    return byEvent;
  }, [events]);
  const users = new Set(events.map((e) => e.user_id)).size;

  return (
    <>
      <Navbar session={session} />

      <main className="section section-compact">
        <div className="container">
          <p><Link to="/start">← Back</Link></p>
          <div className="section-head">
            <span className="eyebrow">Admin</span>
            <h2>Audit trail</h2>
            <p>Who did what, and when: sign-ups, logins, searches, saved flats and valuations.</p>
          </div>

          {allowed === null && <p className="muted">Checking access...</p>}

          {allowed === false && (
            <div className="panel">
              <h3>Admins only</h3>
              <p className="muted">This page is only available to the admin account.</p>
            </div>
          )}

          {allowed && (
            <>
              {error && <p className="alert alert-error">{error}</p>}

              <div className="audit-stats">
                <div className="panel">
                  <div className="loan-sub">Events</div>
                  <div className="loan-amount">{events.length}</div>
                </div>
                <div className="panel">
                  <div className="loan-sub">Registered users</div>
                  <div className="loan-amount">{registered ?? '–'}</div>
                </div>
                <div className="panel">
                  <div className="loan-sub">Users active since logging began</div>
                  <div className="loan-amount">{users}</div>
                </div>
                {['sign_in', 'buyer_search', 'valuation_photos'].map((key) => (
                  <div className="panel" key={key}>
                    <div className="loan-sub">{EVENTS[key]}</div>
                    <div className="loan-amount">{counts[key] ?? 0}</div>
                  </div>
                ))}
              </div>

              <div className="panel">
                <div className="audit-filters">
                  <label>
                    Event
                    <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
                      <option value="">All events</option>
                      {Object.entries(EVENTS).map(([key, label]) => (
                        <option key={key} value={key}>{label} ({counts[key] ?? 0})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Username
                    <input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="Search usernames" />
                  </label>
                  <button type="button" className="btn-outline" onClick={load}>Refresh</button>
                </div>

                <p className="muted">
                  Showing {shown.length} of {events.length} events (the latest 500). Events are recorded from when the
                  audit trail was set up; earlier activity isn't included.
                </p>

                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr><th>Time</th><th>User</th><th>Event</th><th>Details</th></tr>
                    </thead>
                    <tbody>
                      {shown.map((e) => (
                        <tr key={e.id}>
                          <td>{when(e.created_at)}</td>
                          <td>{e.profiles?.username ?? 'unknown'}</td>
                          <td><span className="tag">{EVENTS[e.event] ?? e.event}</span></td>
                          <td className="muted">{describe(e.details)}</td>
                        </tr>
                      ))}
                      {shown.length === 0 && (
                        <tr><td colSpan={4} className="muted">No events match.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
