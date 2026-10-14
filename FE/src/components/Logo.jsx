import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePrank } from '../premium';

const CLICKS_TO_TOGGLE = 5;
const WITHIN_MS = 2000;

export default function Logo() {
  const { toggle } = usePrank();
  const clicks = useRef([]);

  // Easter egg: 5 quick clicks on the logo switch prank mode on or off
  function handleClick() {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < WITHIN_MS), now];
    if (clicks.current.length >= CLICKS_TO_TOGGLE) {
      clicks.current = [];
      toggle();
    }
  }

  return (
    <Link to="/" className="logo" onClick={handleClick}>
      <span className="logo-mark">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 11.2 12 3.5l9 7.7V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" />
        </svg>
      </span>
      flatly
    </Link>
  );
}
