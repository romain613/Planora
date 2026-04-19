import { T } from "../../theme";
import I from "./I";

const Modal = ({ open, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" style={{ position:"fixed", inset:0, zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.3)", backdropFilter:"blur(4px)" }}/>
      <div style={{ position:"relative", background:T.surface, borderRadius:18, width:"90%", maxWidth:width, maxHeight:"85vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.15)", border:`1px solid ${T.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 24px", borderBottom:`1px solid ${T.border}` }}>
          <h3 id="modal-title" style={{ fontSize:16, fontWeight:700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Fermer" style={{ cursor:"pointer", color:T.text3, padding:4, background:"none", border:"none", display:"flex" }}><I n="x" s={18}/></button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
