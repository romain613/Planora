// V3.x.17 — Footer SaaS minimal brand-aware.
// Source unique de vérité : useBrand() résout le brand actif via hostname.
// Aucune mention légale externe (COMPETENCES FIRST, SIRET, etc.) côté UI SaaS —
// les pages /mentions-legales /privacy /terms restent accessibles directement par URL
// pour Twilio compliance, mais ne sont pas liées depuis ce footer.
import React from 'react';
import { useBrand } from '../brand/useBrand.js';

export default function AppFooter() {
  const brand = useBrand();
  const year = new Date().getFullYear();
  const name = (brand && brand.name) || 'Calendar360';
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '12px 16px',
        fontSize: 11,
        color: '#94A3B8',
        fontFamily: "'Onest','Outfit',system-ui,sans-serif",
      }}
    >
      © {year} {name}
    </div>
  );
}
