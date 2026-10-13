import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import { logEvent } from '../audit';
import PasswordInput from '../components/PasswordInput';

// Name and username: the name lives in the account's metadata; the username is also in public.profiles,
// which is what logging in by username looks up
function DetailsForm({ user }) {
  const [fullName, setFullName] = useState(user.user_metadata.full_name ?? '');
  const [username, setUsername] = useState(user.user_metadata.username ?? '');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const name = fullName.trim();
    const newUsername = username.trim();
    if (!newUsername) {
      setError('Username can\'t be empty');
      return;
    }
    if (newUsername.includes('@')) {
      setError('Username cannot contain "@"');
      return;
    }

    setSaving(true);
    try {
      if (newUsername.toLowerCase() !== (user.user_metadata.username ?? '').toLowerCase()) {
        // Taken if it belongs to an account other than this one (usernames ignore upper/lower case)
        const { data: owner, error: lookupError } = await supabase.rpc('find_account_email', { p_identifier: newUsername });
        if (lookupError) throw lookupError;
        if (owner && owner.toLowerCase() !== user.email.toLowerCase()) {
          setError('That username is already taken');
          return;
        }
        const { data: updated, error: profileError } = await supabase
          .from('profiles')
          .update({ username: newUsername })
          .eq('id', user.id)
          .select('id');
        if (profileError) throw profileError.code === '23505' ? new Error('That username is already taken') : profileError;
        // Row Level Security silently skips rows it won't let you change, so check one was updated
        if (!updated?.length) {
          throw new Error('Couldn\'t update your username: your profile row is missing or locked. Re-run supabase/auth_setup.sql.');
        }
      }
      // Also updates the session, so the navbar shows the new name straight away
      const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: name, username: newUsername } });
      if (updateError) throw updateError;
      logEvent('profile_updated', { username: newUsername });
      setMessage('Profile updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h3>Name and username</h3>
      <div>
        <label>
          Name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Arun Kumar" />
        </label>
      </div>
      <div>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <p className="muted field-hint">You can log in with this or your email ({user.email}).</p>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      {message && <p className="alert alert-success">{message}</p>}
      <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
    </form>
  );
}

// Collapsed to a single button until the user chooses to change their password
function PasswordForm({ user }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (password === current) {
      setError('The new password must be different from the current one');
      return;
    }

    setSaving(true);
    try {
      // Supabase doesn't ask for the old password, so check it first by signing in with it
      const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (checkError) {
        setError('Current password is incorrect');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      close();
      logEvent('password_changed');
      setMessage('Password changed. Use the new one next time you log in.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setCurrent('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  }

  if (!open) {
    return (
      <div className="panel">
        <h3>Password</h3>
        {message && <p className="alert alert-success">{message}</p>}
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            setMessage('');
            setOpen(true);
          }}
        >
          Change password
        </button>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h3>Change password</h3>
      <div>
        <label>
          Current password
          <PasswordInput
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            autoFocus
          />
        </label>
      </div>
      <div>
        <label>
          New password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        </label>
      </div>
      <div>
        <label>
          Re-enter new password
          <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        </label>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      {message && <p className="alert alert-success">{message}</p>}
      <div className="form-buttons">
        <button type="button" className="btn-ghost" onClick={close} disabled={saving}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? 'Changing...' : 'Change password'}</button>
      </div>
    </form>
  );
}

export default function ProfilePage({ session }) {
  return (
    <>
      <Navbar session={session} />

      <main className="section section-compact">
        <div className="container">
          <p><Link to="/start">← Back</Link></p>
          <div className="section-head">
            <span className="eyebrow">Your account</span>
            <h2>Profile</h2>
            <p>Update your name and username, or change your password.</p>
          </div>

          <div className="profile-layout">
            <DetailsForm user={session.user} />
            <PasswordForm user={session.user} />
          </div>
        </div>
      </main>
    </>
  );
}
