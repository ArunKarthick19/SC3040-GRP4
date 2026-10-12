import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Logo from '../components/Logo';

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    const trimmedUsername = username.trim();
    if (trimmedUsername.includes('@')) {
      setError('Username cannot contain "@"');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const { data: existing } = await supabase.rpc('get_email_by_username', { p_username: trimmedUsername });
    if (existing) {
      setError('Username is already taken');
      setLoading(false);
      return;
    }

    // username goes into user metadata; a DB trigger copies it into public.profiles
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: trimmedUsername } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // With "Confirm email" off in Supabase, signUp logs the user in straight away
    if (data.session) {
      navigate('/start');
      return;
    }
    setMessage('Account created, but email confirmation is still on in Supabase. Turn off "Confirm email" to log in directly.');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Logo />
        <h2>Sign up</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </div>
          <div>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
          </div>
          <div>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
          </div>
          <div>
            <label>
              Re-enter password
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
            </label>
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          {message && <p className="alert alert-success">{message}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Signing up...' : 'Sign up'}</button>
        </form>
        <p>Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
