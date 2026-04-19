import React, { useRef, useEffect } from "react";
import { T } from "../../../theme";

const PlacesAutocomplete = ({ value, onChange, placeholder, style }) => {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  useEffect(() => {
    if (!inputRef.current || acRef.current) return;
    if (window.google?.maps?.places) {
      acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, { types: ["establishment","geocode"] });
      acRef.current.addListener("place_changed", () => {
        const place = acRef.current.getPlace();
        if (place?.formatted_address) onChange(place.formatted_address);
        else if (place?.name) onChange(place.name);
      });
    }
  }, [window.google?.maps?.places]);
  return <input ref={inputRef} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, fontSize:13, outline:"none", boxSizing:"border-box", ...style }}/>;
};


export default PlacesAutocomplete;
