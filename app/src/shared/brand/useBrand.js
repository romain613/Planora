import { useContext } from 'react';
import { BrandContext } from './BrandContext.jsx';
import { resolveBrand } from './resolveBrand.js';

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (ctx) return ctx;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return resolveBrand(hostname);
}
