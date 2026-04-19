import { T } from "../../theme";
import I from "./I";

const Input = ({ label, placeholder, value, onChange, icon, type="text", style:s, readOnly, id:inputId }) => {
  const _id = inputId || (label ? "inp-"+label.replace(/\s/g,"-").toLowerCase() : undefined);
  return (
  <div style={s}>
    {label && <label htmlFor={_id} style={{ display:"block", fontSize:12, fontWeight:600, color:T.text2, marginBottom:5 }}>{label}</label>}
    <div style={{ position:"relative" }}>
      {icon && <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:T.text3 }}><I n={icon} s={15}/></span>}
      <input id={_id} type={type} placeholder={placeholder} value={value} onChange={onChange} readOnly={readOnly} style={{
        width:"100%", boxSizing:"border-box", padding: icon?"9px 12px 9px 34px":"9px 12px",
        background: readOnly?T.bg:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
        color:T.text, fontSize:13, outline:"none", fontFamily:"inherit",
      }}/>
    </div>
  </div>
);};

export default Input;
