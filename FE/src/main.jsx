import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import PrankProvider from './components/PrankPaywall';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {/* Hash URLs (/#/buy): the server only ever sees /, so refreshing any page works */}
    <HashRouter>
      <PrankProvider>
        <App />
      </PrankProvider>
    </HashRouter>
  </React.StrictMode>
);
