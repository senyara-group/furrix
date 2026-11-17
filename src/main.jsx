import React from 'react';
import ReactDOM from 'react-dom/client';
import Furrix from './Furrix.jsx';
import FurrixMVP from './FurrixMVP.jsx';
import PlatformCheck from './platform/PlatformCheck';
import ProductApp from './app/ProductApp';
import { AppPreview } from './app/AppShell';

// Le prototype initial reste l'entrée par défaut ; le design cible « Plein air » est à intégrer.
// VITE_FURRIX_APP=mvp lance le MVP, banc d'essai temporaire des services auth / profil animal branchés à Supabase.
const PreviewUnavailable = () => <p>L’aperçu de l’accueil est disponible uniquement en développement.</p>;
const App = import.meta.env.VITE_FURRIX_APP === 'home-preview' ? (import.meta.env.DEV ? AppPreview : PreviewUnavailable)
  : import.meta.env.VITE_FURRIX_APP === 'auth' ? ProductApp
  : import.meta.env.VITE_FURRIX_APP === 'platform-check' ? PlatformCheck
  : import.meta.env.VITE_FURRIX_APP === 'mvp' ? FurrixMVP : Furrix;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
