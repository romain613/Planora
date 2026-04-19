import { T } from "../../theme";

const Card = ({ children, style:s, onClick, ...rest }) => (
  <div onClick={onClick} {...rest} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, cursor:onClick?"pointer":undefined, ...s }}>{children}</div>
);

export default Card;
