import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { logEvent } from '../audit';
import Logo from './Logo';

// Profile icon with a menu: who's signed in, a link to edit the profile, and log out
function ProfileMenu({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { full_name: fullName, username } = user.user_metadata;
  const shownName = fullName || username || user.email;

  // Close when clicking anywhere outside the menu, or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-avatar"
        onClick={() => setOpen(!open)}
        aria-label="Profile menu"
        aria-expanded={open}
      >
        {shownName.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-head">
            <strong>{shownName}</strong>
            {username && <span className="muted">@{username}</span>}
            <span className="muted">{user.email}</span>
          </div>
          <Link to="/profile" className="profile-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
            Edit profile and password
          </Link>
          {username?.toLowerCase() === 'admin123' && (
            <Link to="/admin" className="profile-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
              Audit trail (admin)
            </Link>
          )}
          <button
            type="button"
            className="profile-dropdown-item"
            role="menuitem"
            onClick={async () => {
              await logEvent('sign_out'); // must be recorded while still signed in
              supabase.auth.signOut();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ session }) {
  const user = session?.user;
  return (
    <header className="navbar">
      <div className="container">
        <Logo />
        <nav className="nav-actions">
          {user ? (
            <>
              <span className="nav-user">
                Hi, <strong>{user.user_metadata.full_name || user.user_metadata.username || user.email}</strong>
              </span>
              <ProfileMenu user={user} />
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
