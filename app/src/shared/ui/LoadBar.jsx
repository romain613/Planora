import { T } from "../../theme";

const LoadBar = ({ ratio }) => {
  const c = ratio < 0.5 ? T.success : ratio < 0.8 ? T.warning : T.danger;
  return <div style={{ width:48, height:6, borderRadius:3, background:T.border }}><div style={{ width:`${Math.min(ratio*100,100)}%`, height:6, borderRadius:3, background:c }}/></div>;
};

export default LoadBar;
