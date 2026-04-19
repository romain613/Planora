import { T } from "../../theme";

const Badge = ({ children, color = T.accent, bg }) => (
  <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600, background: bg||color+"14", color, letterSpacing:0.2 }}>{children}</span>
);

export default Badge;
