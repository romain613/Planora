// Input validators (extracted from App.jsx Phase 1A)

export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isValidPhone = (v) => /^[\+]?[\d\s\-\(\)]{6,}$/.test(v.replace(/\s/g,''));
