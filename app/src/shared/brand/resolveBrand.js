import { BRANDS, DEFAULT_BRAND_ID } from './brands.config.js';

export function resolveBrand(hostname) {
  const host = (hostname || '').toLowerCase();
  if (host) {
    const byDomain = Object.values(BRANDS).find((b) => b.domain === host);
    if (byDomain) return byDomain;
  }
  const byDefaultFlag = Object.values(BRANDS).find((b) => b.isDefault);
  if (byDefaultFlag) return byDefaultFlag;
  return BRANDS[DEFAULT_BRAND_ID];
}
