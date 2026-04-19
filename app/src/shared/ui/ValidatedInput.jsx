import { useState } from "react";
import { T } from "../../theme";
import I from "./I";
import Req from "./Req";
import HelpTip from "./HelpTip";

const ValidatedInput = ({ label, required, placeholder, value, onChange, icon, type="text", validate, errorMsg, style:s, readOnly, helpTip }) => {
  const [touched, setTouched] = useState(false);
  const hasValue = value && value.trim && value.trim().length > 0;
  const isEmpty = required && touched && !hasValue;
  const isInvalid = touched && hasValue && validate && !validate(value);
  const isValid = hasValue && (!validate || validate(value));
  const showError = isEmpty || isInvalid;
  const borderColor = showError ? T.danger : (isValid && touched) ? T.success : T.border;
  return (
    <div style={s}>
      {label && <label style={{ display:"flex", alignItems:"center", fontSize:12, fontWeight:600, color:showError?T.danger:T.text2, marginBottom:5 }}>
        {label}{required && <Req/>}{helpTip && <HelpTip text={helpTip}/>}
      </label>}
      <div style={{ position:"relative" }}>
        {icon && <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:showError?T.danger:T.text3 }}><I n={icon} s={15}/></span>}
        <input type={type} placeholder={placeholder} value={value} readOnly={readOnly}
          onChange={onChange} onBlur={()=>setTouched(true)}
          style={{ width:"100%", boxSizing:"border-box", padding: icon?"9px 36px 9px 34px":"9px 36px 9px 12px",
            background: readOnly?T.bg:T.surface, border:`1.5px solid ${borderColor}`, borderRadius:8,
            color:T.text, fontSize:13, outline:"none", fontFamily:"inherit", transition:"border-color .2s",
          }}/>
        {touched && hasValue && !isInvalid && isValid && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:T.success, fontSize:13, fontWeight:700 }}>✓</span>}
        {isInvalid && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:T.danger, fontSize:13, fontWeight:700 }}>✗</span>}
      </div>
      {isEmpty && <div style={{ fontSize:10, color:T.danger, marginTop:3, fontWeight:500 }}>Ce champ est obligatoire</div>}
      {isInvalid && <div style={{ fontSize:10, color:T.danger, marginTop:3, fontWeight:500 }}>{errorMsg || "Format invalide"}</div>}
    </div>
  );
};

export default ValidatedInput;
