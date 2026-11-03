import React from 'react';
import ReactDOM from 'react-dom/client';
import Furrix from './Furrix.jsx';
import FurrixMVP from './FurrixMVP.jsx';

// Point d'entrée : Furrix.jsx est l'interface cible (encore en démonstration, non connectée à Supabase).
// VITE_FURRIX_APP=mvp lance le MVP, banc d'essai temporaire des services auth / profil animal branchés à Supabase.
const App = import.meta.env.VITE_FURRIX_APP === 'mvp' ? FurrixMVP : Furrix;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
