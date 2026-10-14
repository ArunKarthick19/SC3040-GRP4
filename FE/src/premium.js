// Easter egg: "prank mode" puts a fake paywall in front of the main buttons.
// Toggled by clicking the logo 5 times quickly; saved in this browser only (see PrankPaywall.jsx).
import { createContext, useContext } from 'react';

export const PRANK_KEY = 'flatly-prank-mode';

export const PrankContext = createContext({ enabled: false, toggle: () => {}, guard: (action) => action() });

// guard(action): runs `action` straight away, or after the fake paywall when prank mode is on
export const usePrank = () => useContext(PrankContext);
