import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Logo from './Logo';

export default function Navbar({ session }) {
  return (
    <header className="navbar">
      <div className="container">
        <Logo />
        <nav className="nav-actions">
          {session ? (
            <>
              <span className="nav-user">
                Hi, <strong>{session.user.user_metadata.username ?? session.user.email}</strong>
              </span>
              <button className="btn-outline" onClick={() => supabase.auth.signOut()}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">Log in</Link>
              <Link to="/signup" className="btn">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
