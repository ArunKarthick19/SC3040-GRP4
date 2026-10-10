import { useEffect, useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';

function Home({ session }) {
  if (!session) {
    return (
      <div>
        <h1>welcome to flatly</h1>
        <Link to="/login"><button>Log in</button></Link>
        <Link to="/signup"><button>Sign up</button></Link>
      </div>
    );
  }

  return (
    <div>
      <h1>welcome to flatly</h1>
      <p>Logged in as {session.user.user_metadata.username ?? session.user.email}</p>
      <button onClick={() => supabase.auth.signOut()}>Log out</button>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Home session={session} />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
    </Routes>
  );
}
