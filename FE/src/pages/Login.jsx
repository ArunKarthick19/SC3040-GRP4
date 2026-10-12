import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Logo from '../components/Logo';

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    let email = identifier.trim();

    // Supabase auth only signs in by email, so look up the email for a username
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('find_account_email', { p_identifier: email });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setError('Invalid username or password');
        setLoading(false);
        return;
      }
      email = data;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate('/start');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Logo />
        <h2>Log in</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label>
              Email or username
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </label>
          </div>
          <div>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Log in'}</button>
        </form>
        <p><Link to="/forgot-password">Forgot password?</Link></p>
        <p>No account? <Link to="/signup">Sign up</Link></p>
      </div>
    </div>
  );
}
