import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// Demo only: no OTP is actually sent, the code is always 3040.
// The reset_password DB function checks it again before changing anything.
const DEMO_OTP = '3040';

export default function ForgotPassword() {
  // 'account' -> 'otp' -> 'password' -> 'done'
  const [step, setStep] = useState('account');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAccount(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error } = await supabase.rpc('find_account_email', { p_identifier: identifier.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data) {
      setError('No account found with that email or username');
      return;
    }
    setEmail(data);
    setStep('otp');
  }

  function handleOtp(e) {
    e.preventDefault();
    setError('');
    if (otp.trim() !== DEMO_OTP) {
      setError('Invalid OTP');
      return;
    }
    setStep('password');
  }

  async function handlePassword(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('reset_password', {
      p_identifier: identifier.trim(),
      p_otp: otp.trim(),
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
    setStep('done');
  }

  return (
    <div>
      <h2>Reset password</h2>

      {step === 'account' && (
        <form onSubmit={handleAccount}>
          <div>
            <label>
              Email or username
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </label>
          </div>
          {error && <p>{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Checking...' : 'Send OTP'}</button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={handleOtp}>
          <p>An OTP has been sent to {email}.</p>
          <div>
            <label>
              OTP
              <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
            </label>
          </div>
          {error && <p>{error}</p>}
          <button type="submit">Verify OTP</button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePassword}>
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
          {error && <p>{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset password'}</button>
        </form>
      )}

      {step === 'done' && <p>Password reset. You can now log in with your new password.</p>}

      <p><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
