import { T } from "../../theme";

const Stars = ({ count, max=5, onChange, size=14 }) => (
  <div style={{ display:"flex", gap:2 }}>
    {Array.from({length:max}).map((_,i) => (
      <span key={i} onClick={() => onChange?.(i+1)} style={{ cursor:onChange?"pointer":"default", color: i<count?T.warning:T.border2 }}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill={i<count?"currentColor":"none"} stroke="currentColor" strokeWidth="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </span>
    ))}
  </div>
);

export default Stars;
