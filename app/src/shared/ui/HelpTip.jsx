import { useState, useRef } from "react";
import { T } from "../../theme";
import I from "./I";

const HelpTip = ({ text }) => {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  return (
    <span ref={ref} style={{ position:"relative", display:"inline-flex", alignItems:"center", marginLeft:4, cursor:"help" }}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)} onClick={()=>setShow(s=>!s)}>
      <span style={{ width:15, height:15, borderRadius:8, background:T.accentBg, border:`1px solid ${T.accentBorder}`, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:T.accent }}>?</span>
      {show && <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)", background:T.text, color:T.bg, padding:"8px 12px", borderRadius:8, fontSize:11, lineHeight:1.5, fontWeight:500, whiteSpace:"normal", width:220, zIndex:9999, boxShadow:"0 8px 24px rgba(0,0,0,0.25)", pointerEvents:"none", animation:"fadeInScale .15s ease" }}>
        {text}
        <div style={{ position:"absolute", top:"100%", left:"50%", transform:"translateX(-50%)", width:0, height:0, borderLeft:"5px solid transparent", borderRight:"5px solid transparent", borderTop:`5px solid ${T.text}` }}/>
      </div>}
    </span>
  );
};

export default HelpTip;
