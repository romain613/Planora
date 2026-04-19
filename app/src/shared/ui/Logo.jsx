const Logo = ({ s = 32, rounded = 10 }) => (
  <svg width={s} height={s} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: rounded, flexShrink: 0 }}>
    <defs>
      <linearGradient id="logoBg" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#2563EB"/>
        <stop offset="100%" stopColor="#7C3AED"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="26" fill="url(#logoBg)"/>
    {/* Big C arc */}
    <path d="M72 28 A35 35 0 1 0 72 92" stroke="#fff" strokeWidth="11" strokeLinecap="round" fill="none"/>
    {/* 360 bold */}
    <text x="66" y="72" textAnchor="middle" fill="#fff" fontFamily="system-ui,sans-serif" fontSize="30" fontWeight="900" letterSpacing="-1">360</text>
  </svg>
);

export default Logo;
