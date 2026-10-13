import { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ChooseRole from "./pages/ChooseRole";
import BuyerPage from "./pages/BuyerPage";
import SellerPage from "./pages/SellerPage";
import Logo from "./components/Logo";
import Navbar from "./components/Navbar";
import { BuyIcon, SellIcon } from "./components/icons";

function FeatureAction({ session, to, children }) {
  // Signed-in users go straight to the tool; everyone else signs up first
  return (
    <Link to={session ? to : "/signup"} className="btn">
      {children}
    </Link>
  );
}

function Home({ session }) {
  const name = session?.user.user_metadata.username;

  return (
    <>
      <Navbar session={session} />

      <main>
        <section className="hero">
          <div className="container">
            <div>
              <span className="eyebrow">Built for Singapore HDB flats</span>
              {session ? (
                <h1>
                  Welcome back{name ? `, ${name}` : ""}.{" "}
                  <span className="accent">What's next?</span>
                </h1>
              ) : (
                <h1>
                  Buy or sell your HDB flat,{" "}
                  <span className="accent">with clarity.</span>
                </h1>
              )}
              <p className="hero-lead">
                Tell us your savings and CPF to see which towns, flat types and
                loan amounts fit your budget. Selling? Enter your flat details
                and photos for a valuation that reflects your flat's real
                condition.
              </p>
              {session ? (
                <div className="hero-ctas">
                  <Link to="/start" className="btn btn-lg">
                    Buy or sell a flat
                  </Link>
                </div>
              ) : (
                <div className="hero-ctas">
                  <Link to="/signup" className="btn btn-lg">
                    I'm buying
                  </Link>
                  <Link to="/signup" className="btn btn-lg btn-outline">
                    I'm selling
                  </Link>
                </div>
              )}
            </div>

            <div className="preview-card" aria-label="Sample valuation">
              <div className="preview-header">
                <span className="preview-title">Sample valuation</span>
                <span className="tag">4-Room · Tampines</span>
              </div>
              <div className="preview-price">$612,000</div>
              <div className="preview-sub">
                Estimated resale value · 92 years lease left
              </div>
              <div className="photo-grid">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <ul className="stat-list">
                <li>
                  Base valuation <strong>$598,000</strong>
                </li>
                <li>
                  Condition from 6 photos{" "}
                  <span className="tag tag-success">Well kept</span>
                </li>
                <li>
                  Condition adjustment <strong className="up">+$14,000</strong>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="section section-alt">
          <div className="container">
            <div className="section-head">
              <h2>One place for both sides of the move</h2>
              <p>
                Whether you're getting your first flat or moving on from your
                current one, Flatly does the maths for you.
              </p>
            </div>

            <div className="feature-grid">
              <article className="feature-card">
                <div className="feature-icon">{BuyIcon}</div>
                <h3>For buyers</h3>
                <p>
                  Find out what you can afford before you start viewing flats.
                </p>
                <ul className="check-list">
                  <li>
                    Enter your cash savings, CPF balance and preferred flat type
                  </li>
                  <li>See which towns and locations match your budget</li>
                  <li>Get an estimate of how much you can borrow</li>
                  <li>
                    Find out which flat types (3-room, 4-room, 5-room…) you can
                    buy
                  </li>
                </ul>
                <FeatureAction session={session} to="/buy">
                  Get recommendations
                </FeatureAction>
              </article>

              <article className="feature-card highlight">
                <div className="feature-icon">{SellIcon}</div>
                <h3>For sellers</h3>
                <p>
                  Find out what your flat is worth, with its condition taken
                  into account.
                </p>
                <ul className="check-list">
                  <li>Enter your flat type, lease type and remaining lease</li>
                  <li>Upload up to 6 photos of your home</li>
                  <li>Get an estimated resale value for your flat</li>
                  <li>
                    The estimate is adjusted for the condition shown in your
                    photos
                  </li>
                </ul>
                <FeatureAction session={session} to="/sell">
                  Value my flat
                </FeatureAction>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <h2>How it works</h2>
              <p>Three steps from your numbers to an answer.</p>
            </div>
            <ol className="steps">
              <li>
                <h3>Tell us about you</h3>
                <p>
                  Buyers share their savings, CPF and preferred flat type.
                  Sellers enter their flat's details.
                </p>
              </li>
              <li>
                <h3>Add photos</h3>
                <p>
                  Sellers upload up to 6 photos so Flatly can assess the
                  condition of the flat.
                </p>
              </li>
              <li>
                <h3>Get your answer</h3>
                <p>
                  See recommended locations and a loan estimate, or a valuation
                  adjusted for condition.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {!session && (
          <section className="section" style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="cta-band">
                <h2>Ready to plan your next move?</h2>
                <p>Create a free account to get started.</p>
                <Link to="/signup" className="btn btn-lg">
                  Create an account
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <Logo />
          <span>© {new Date().getFullYear()} Flatly · SC3040 Group 4</span>
        </div>
      </footer>
    </>
  );
}

// Pages that need a signed-in user; waits for the stored session before redirecting
function RequireAuth({ session, children }) {
  if (session === undefined) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  // undefined = still loading the stored session, null = signed out
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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
      <Route
        path="/start"
        element={
          <RequireAuth session={session}>
            <ChooseRole session={session} />
          </RequireAuth>
        }
      />
      <Route
        path="/buy"
        element={
          <RequireAuth session={session}>
            <BuyerPage session={session} />
          </RequireAuth>
        }
      />
      <Route
        path="/sell"
        element={
          <RequireAuth session={session}>
            <SellerPage session={session} />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
