import { useCallback, useEffect, useMemo, useState } from 'react';
import { PRANK_KEY, PrankContext } from '../premium';

const readSaved = () => {
  try {
    return localStorage.getItem(PRANK_KEY) === 'on';
  } catch {
    return false;
  }
};

const FEATURES = [
  'See which towns fit your budget',
  'Flat type suggestions from our AI model',
  'Heat maps with nearest MRT and bus stops',
  'AI photo valuations for sellers',
];

// Formats as the user types: "4242424242424242" -> "4242 4242 4242 4242", "1228" -> "12 / 28"
const cardNumber = (v) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const expiry = (v) => v.replace(/\D/g, '').slice(0, 4).replace(/^(\d{2})(\d)/, '$1 / $2');
const digits = (max) => (v) => v.replace(/\D/g, '').slice(0, max);

// The fake paywall: plan -> card form -> "Gotcha!". "Maybe later" just closes it.
// The card fields are optional, never leave this component, are never saved or logged, and vanish when it closes.
function Paywall({ onUnlock, onClose }) {
  const [step, setStep] = useState('plan'); // 'plan' -> 'card' -> 'gotcha'
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '', postal: '' });
  const [paying, setPaying] = useState(false);

  const update = (field, format = (v) => v) => (e) => setCard({ ...card, [field]: format(e.target.value) });

  function pay(e) {
    e.preventDefault();
    setPaying(true);
    // A moment of "processing" for effect, then throw away whatever was typed
    setTimeout(() => {
      setCard({ name: '', number: '', expiry: '', cvc: '', postal: '' });
      setStep('gotcha');
    }, 1200);
  }

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="modal-dialog paywall" role="dialog" aria-label="Flatly Premium" onClick={(e) => e.stopPropagation()}>
        {step === 'gotcha' && (
          <div className="paywall-gotcha">
            <div className="paywall-emoji" aria-hidden="true">🎉</div>
            <h3>Gotcha!</h3>
            <p>Flatly is 100% free. There is no Premium. Enjoy!</p>
            <p className="muted">Nothing was charged and nothing you typed was saved.</p>
            <button type="button" onClick={onUnlock}>Take me to my results</button>
          </div>
        )}

        {step === 'card' && (
          // autoComplete off: the browser shouldn't offer to fill in saved cards here
          <form className="paywall-card" onSubmit={pay} autoComplete="off">
            <span className="paywall-badge">✦ Flatly Premium · $49.99 / month</span>
            <h3>Payment details</h3>
            <label>
              Name on card
              <input value={card.name} onChange={update('name')} placeholder="Tan Ah Kow" autoComplete="off" />
            </label>
            <label>
              Card number
              <input
                value={card.number}
                onChange={update('number', cardNumber)}
                inputMode="numeric"
                placeholder="4242 4242 4242 4242"
                autoComplete="off"
              />
            </label>
            <div className="paywall-row">
              <label>
                Expiry
                <input value={card.expiry} onChange={update('expiry', expiry)} inputMode="numeric" placeholder="MM / YY" autoComplete="off" />
              </label>
              <label>
                CVC
                <input value={card.cvc} onChange={update('cvc', digits(4))} inputMode="numeric" placeholder="123" autoComplete="off" />
              </label>
              <label>
                Postal code
                <input value={card.postal} onChange={update('postal', digits(6))} inputMode="numeric" placeholder="530910" autoComplete="off" />
              </label>
            </div>
            <button type="submit" className="btn-ai paywall-cta" disabled={paying}>
              {paying ? 'Processing payment...' : 'Pay $49.99'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setStep('plan')} disabled={paying}>← Back</button>
          </form>
        )}

        {step === 'plan' && (
          <>
            <span className="paywall-badge">✦ Flatly Premium</span>
            <h3>You've used all your free searches</h3>
            <p className="muted">Unlock unlimited searches, valuations and maps.</p>
            <div className="paywall-price">
              <strong>$49.99</strong><span className="muted"> / month</span>
              <span className="paywall-strike">$99.99</span>
            </div>
            <ul className="check-list">
              {FEATURES.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button type="button" className="btn-ai paywall-cta" onClick={() => setStep('card')}>Unlock Premium</button>
            <button type="button" className="btn-ghost" onClick={onClose}>Maybe later</button>
          </>
        )}
      </div>
    </div>
  );
}

// Provides prank mode to the whole app, and shows the paywall and the on/off toast
export default function PrankProvider({ children }) {
  const [enabled, setEnabled] = useState(readSaved);
  const [pending, setPending] = useState(null); // action waiting behind the paywall
  const [toast, setToast] = useState('');

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      try {
        localStorage.setItem(PRANK_KEY, next ? 'on' : 'off');
      } catch {
        // Storage blocked: prank mode still works until the page is refreshed
      }
      setToast(next ? '🎭 Prank mode ON' : 'Prank mode OFF');
      return next;
    });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const guard = useCallback((action) => {
    if (enabled) setPending(() => action);
    else action();
  }, [enabled]);

  const value = useMemo(() => ({ enabled, toggle, guard }), [enabled, toggle, guard]);

  return (
    <PrankContext.Provider value={value}>
      {children}
      {pending && (
        <Paywall
          onUnlock={() => {
            const action = pending;
            setPending(null);
            action();
          }}
          onClose={() => setPending(null)}
        />
      )}
      {toast && <div className="prank-toast" role="status">{toast}</div>}
    </PrankContext.Provider>
  );
}
