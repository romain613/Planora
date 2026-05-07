import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrandProvider } from './shared/brand/BrandContext.jsx'
import { resolveBrand } from './shared/brand/resolveBrand.js'

// V3.x.17 — Title + favicon dynamiques selon brand actif (résolu par hostname).
// CollabPortal/AdminDash continuent à customiser document.title par tab après mount —
// ce bootstrap ne fixe que la valeur initiale (avant le premier render).
try {
  const _brand = resolveBrand(typeof window !== 'undefined' ? window.location.hostname : '');
  if (_brand && _brand.name) document.title = _brand.name;
  if (_brand && _brand.favicon) {
    const _icon = document.querySelector('link[rel="icon"]');
    if (_icon) _icon.setAttribute('href', _brand.favicon);
  }
} catch (_e) { /* fallback silencieux : title <title> par défaut conservé */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrandProvider>
      <App />
    </BrandProvider>
  </StrictMode>,
)
