import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { BuyIcon, SellIcon } from '../components/icons';

export default function ChooseRole({ session }) {
  const name = session.user.user_metadata.username;

  return (
    <>
      <Navbar session={session} />

      <main className="section section-compact">
        <div className="container">
          <p><Link to="/">← Back</Link></p>
          <div className="section-head">
            <span className="eyebrow">Get started</span>
            <h2>What would you like to do{name ? `, ${name}` : ''}?</h2>
            <p>Pick one to continue. You can always come back and switch.</p>
            {session.user.user_metadata.username?.toLowerCase() === 'admin123' && (
              <p><Link to="/admin" className="btn btn-outline">Admin: audit trail</Link></p>
            )}
          </div>

          <div className="feature-grid">
            <Link to="/buy" className="feature-card choice-card">
              <div className="feature-icon">{BuyIcon}</div>
              <h3>I'm buying</h3>
              <p>See which towns, flat types and loan amounts fit your savings and CPF.</p>
              <span className="btn">Start as a buyer</span>
            </Link>

            <Link to="/sell" className="feature-card choice-card highlight">
              <div className="feature-icon">{SellIcon}</div>
              <h3>I'm selling</h3>
              <p>Get a resale estimate for your flat, adjusted for the condition in your photos.</p>
              <span className="btn">Start as a seller</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
