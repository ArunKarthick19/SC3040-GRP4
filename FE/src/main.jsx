import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import PrankProvider from './components/PrankPaywall';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <PrankProvider>
        <App />
      </PrankProvider>
    </BrowserRouter>
  </React.StrictMode>
);
