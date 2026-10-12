import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Logo from '../components/Logo';

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    // No email involved: the reset_password DB function sets the new password directly
    const { data, error } = await supabase.rpc('reset_password', {
      p_identifier: identifier.trim(),
      p_new_password: password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data) {
      setError('No account found with that email or username');
      return;
    }
    setMessage('Password reset. You can now log in with your new password.');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Logo />
        <h2>Reset password</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label>
              Email or username
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </label>
          </div>
          <div>
            <label>
              New password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
          </div>
          <div>
            <label>
              Re-enter new password
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
            </label>
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          {message && <p className="alert alert-success">{message}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset password'}</button>
        </form>
        <p><Link to="/login">Back to log in</Link></p>
      </div>
    </div>
  );
}
