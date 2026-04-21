import { createContext, useMemo } from 'react';
import { resolveBrand } from './resolveBrand.js';

export const BrandContext = createContext(null);

export function BrandProvider({ brand, children }) {
  const resolved = useMemo(() => {
    if (brand) return brand;
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return resolveBrand(hostname);
  }, [brand]);

  return (
    <BrandContext.Provider value={resolved}>{children}</BrandContext.Provider>
  );
}
