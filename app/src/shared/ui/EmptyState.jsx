import { T } from "../../theme";
import I from "./I";
import Btn from "./Btn";

const EmptyState = ({ icon = "inbox", title = "Aucun élément", subtitle, action, onAction }) => (
  <div style={{ padding:"40px 20px", textAlign:"center", color:T.text3 }}>
    <div style={{ width:56, height:56, borderRadius:16, background:T.accentBg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
      <I n={icon} s={24} style={{ color:T.accent }}/>
    </div>
    <div style={{ fontSize:14, fontWeight:600, color:T.text2, marginBottom:4 }}>{title}</div>
    {subtitle && <div style={{ fontSize:12, color:T.text3, marginBottom:12 }}>{subtitle}</div>}
    {action && <Btn small primary onClick={onAction}>{action}</Btn>}
  </div>
);

export default EmptyState;
