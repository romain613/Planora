import { T } from "../../theme";

const Btn = ({ children, primary, danger, small, ghost, success, onClick, style:s, disabled, full }) => (
  <button onClick={onClick} disabled={disabled} style={{
    display:"inline-flex", alignItems:"center", gap:6, padding: small?"6px 12px":"9px 18px",
    borderRadius:8, border: ghost?"none":`1px solid ${primary?T.accent:danger?T.danger:success?T.success:T.border}`,
    cursor:disabled?"not-allowed":"pointer", fontSize: small?12:13, fontWeight:600,
    background: primary?T.accent:danger?T.dangerBg:success?T.successBg:ghost?"transparent":T.surface,
    color: primary?"#fff":danger?T.danger:success?T.success:ghost?T.text2:T.text,
    opacity:disabled?0.5:1, transition:"all 0.15s", width:full?"100%":undefined,
    justifyContent:full?"center":undefined, fontFamily:"inherit", ...s,
  }}>{children}</button>
);

export default Btn;
