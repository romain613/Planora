import { T } from "../../theme";

const Spinner = ({ size = 20, color }) => (
  <div style={{ width:size, height:size, border:`2px solid ${T.border}`, borderTopColor: color || T.accent, borderRadius:"50%", animation:"spin 0.6s linear infinite", display:"inline-block" }}/>
);

export default Spinner;
