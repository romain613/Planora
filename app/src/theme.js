// Theme tokens (extracted from App.jsx Phase 1A)
// T is a `let` export — live binding via ESM. setTheme() swaps the reference.

export const T_LIGHT = {
  bg: "#F6F5F2", bg2: "#EDECEA", surface: "#FFFFFF", surface2: "#F9F8F6",
  card: "#FFFFFF",
  border: "#E4E2DD", border2: "#D6D3CC", text: "#1A1917", text2: "#5C5A54",
  text3: "#9C998F", accent: "#2563EB", accent2: "#3B82F6", accentBg: "#EFF6FF",
  accentBorder: "#BFDBFE", success: "#059669", successBg: "#ECFDF5",
  warning: "#D97706", warningBg: "#FFFBEB", danger: "#DC2626", dangerBg: "#FEF2F2",
  purple: "#7C3AED", purpleBg: "#F5F3FF", pink: "#EC4899",
  teal: "#0D9488", tealBg: "#F0FDFA",
};

export const T_DARK = {
  bg: "#0F0F0F", bg2: "#1A1A1A", surface: "#1E1E1E", surface2: "#171717",
  card: "#1E1E1E",
  border: "#2A2A2A", border2: "#3A3A3A", text: "#E8E6E1", text2: "#A8A69F",
  text3: "#8A877F", accent: "#3B82F6", accent2: "#60A5FA", accentBg: "#172554",
  accentBorder: "#1E40AF", success: "#34D399", successBg: "#064E3B",
  warning: "#FBBF24", warningBg: "#451A03", danger: "#F87171", dangerBg: "#450A0A",
  purple: "#A78BFA", purpleBg: "#2E1065", pink: "#F472B6",
  teal: "#2DD4BF", tealBg: "#042F2E",
};

export let T = T_LIGHT;

export function setTheme(mode) {
  T = mode === "dark" ? T_DARK : T_LIGHT;
}
