import React from 'react';
import ReactDOM from 'react-dom/client';
import Furrix from './Furrix.jsx';
import FurrixMVP from './FurrixMVP.jsx';
import PlatformCheck from './platform/PlatformCheck';
import ProductApp from './app/ProductApp';
import { AppPreview } from './app/AppShell';
import { resolveAppEntry } from './app/entry';

// Connexion puis accueil Plein air par défaut, y compris sur Vercel sans sélecteur explicite.
const Unavailable = () => <p>Le service n’est pas disponible sur cet environnement. Réessaie plus tard.</p>;
const entry = resolveAppEntry(import.meta.env.VITE_FURRIX_APP, import.meta.env.DEV);
const App = {
  product: ProductApp,
  legacy: import.meta.env.DEV ? Furrix : ProductApp,
  mvp: import.meta.env.DEV ? FurrixMVP : ProductApp,
  'platform-check': PlatformCheck,
  'home-preview': import.meta.env.DEV ? AppPreview : Unavailable,
  unavailable: Unavailable,
}[entry];

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
