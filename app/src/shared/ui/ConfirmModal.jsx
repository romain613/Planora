import { T } from "../../theme";
import I from "./I";
import Btn from "./Btn";

const ConfirmModal = ({ open, onClose, onConfirm, title = "Confirmation", message = "Êtes-vous sûr ?", confirmText = "Confirmer", danger = true }) => {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(4px)" }}/>
      <div style={{ position:"relative", background:T.surface, borderRadius:16, width:"90%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", border:`1px solid ${T.border}`, overflow:"hidden", animation:"fadeInScale .2s ease" }}>
        <div style={{ padding:"24px 24px 16px", textAlign:"center" }}>
          <div style={{ width:48, height:48, borderRadius:12, background:danger ? T.dangerBg : T.accentBg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
            <I n={danger ? "alert-triangle" : "help-circle"} s={24} style={{ color: danger ? T.danger : T.accent }}/>
          </div>
          <h3 style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>{title}</h3>
          <p style={{ fontSize:13, color:T.text2, lineHeight:1.5 }}>{message}</p>
        </div>
        <div style={{ display:"flex", gap:10, padding:"16px 24px 24px", justifyContent:"center" }}>
          <Btn onClick={onClose} style={{ flex:1 }}>Annuler</Btn>
          <Btn danger={danger} primary={!danger} onClick={() => { onConfirm(); onClose(); }} style={{ flex:1 }}>{confirmText}</Btn>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
