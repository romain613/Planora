import { T } from "../../theme";

const Skeleton = ({ width = "100%", height = 16, radius = 6, style: s }) => (
  <div style={{ width, height, borderRadius: radius, background: `linear-gradient(90deg, ${T.border}33 25%, ${T.border}66 50%, ${T.border}33 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", ...s }}/>
);

export default Skeleton;
