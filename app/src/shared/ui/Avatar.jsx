const Avatar = ({ name, color, size=34 }) => (
  <div style={{ width:size, height:size, borderRadius:size/2.8, background:color+"18", color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.35, fontWeight:700, flexShrink:0 }}>
    {name?.split(" ").map(n=>n[0]).join("").slice(0,2)}
  </div>
);

export default Avatar;
