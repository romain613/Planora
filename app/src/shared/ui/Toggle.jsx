import { T } from "../../theme";

const Toggle = ({ on, onToggle, label }) => (
  <button role="switch" aria-checked={!!on} aria-label={label||"Toggle"} onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", background:"none", border:"none", padding:0, fontFamily:"inherit" }}>
    <div style={{ width:38, height:22, borderRadius:11, background: on?T.accent:T.border2, display:"flex", alignItems:"center", padding:"0 3px", justifyContent: on?"flex-end":"flex-start", transition:"all .2s" }}>
      <div style={{ width:16, height:16, borderRadius:8, background:"#fff" }}/>
    </div>
    {label && <span style={{ fontSize:12, color:T.text2 }}>{label}</span>}
  </button>
);

export default Toggle;
