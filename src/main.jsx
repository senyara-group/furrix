import React from 'react';
import ReactDOM from 'react-dom/client';
import Furrix from './Furrix.jsx';
import FurrixMVP from './FurrixMVP.jsx';

// Point d'entrée : produit complet par défaut (données de démonstration).
// VITE_FURRIX_APP=mvp lance le MVP, dont l'authentification et le profil animal sont branchés à Supabase.
const App = import.meta.env.VITE_FURRIX_APP === 'mvp' ? FurrixMVP : Furrix;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
