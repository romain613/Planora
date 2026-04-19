import { T } from "../../theme";
import I from "./I";
import Card from "./Card";

const Stat = ({ label, value, icon, color=T.accent, onClick, active }) => (
  <Card onClick={onClick} style={ onClick ? { cursor:'pointer', transition:'all .15s', border:active?`2px solid ${color}`:`1px solid ${T.border}`, background:active?color+'08':undefined, boxShadow:active?`0 2px 10px ${color}25`:undefined, transform:active?'translateY(-1px)':undefined } : undefined }>
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
      <div style={{ width:36, height:36, borderRadius:10, background:color+"12", display:"flex", alignItems:"center", justifyContent:"center", color }}><I n={icon} s={17}/></div>
      <span style={{ fontSize:12, color:active?color:T.text3, fontWeight:active?700:400 }}>{label}</span>
    </div>
    <div style={{ fontSize:26, fontWeight:800, color:active?color:T.text, letterSpacing:-1 }}>{value}</div>
  </Card>
);

export default Stat;
