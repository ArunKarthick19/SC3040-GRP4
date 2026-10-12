import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

// Placeholder until the buyer and seller flows are built
export default function ComingSoon({ session, title }) {
  return (
    <>
      <Navbar session={session} />

      <main className="section">
        <div className="container">
          <div className="section-head">
            <h2>{title}</h2>
            <p>This part of Flaty is still being built. Check back soon.</p>
            <Link to="/start" className="btn">Back</Link>
          </div>
        </div>
      </main>
    </>
  );
}
