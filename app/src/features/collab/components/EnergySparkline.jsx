// EnergySparkline — V1.10.4-r11.0.24 Phase 1 SAFE
//
// Mini sparkline 24h activite jour, SVG inline, height 24px. Style Linear/Notion
// analytics minimaliste. Hover bar > tooltip 1-line "10h → 11h : 3 actions".
// React.memo pour eviter re-render quand bins inchanges.
//
// Props :
// - bins        : array<{hour, positive, negative, count, net}> taille 24
// - maxBin      : number — max amplitude pour normalisation
// - currentHour : number — heure courante highlight (full color)
// - color       : string — couleur primaire (depuis energyColor parent)

import React, { memo, useState } from "react";
import { T } from "../../../theme";

const SVG_W = 240;
const SVG_H = 24;
const BAR_W = SVG_W / 24;

const EnergySparkline = memo(function EnergySparkline({ bins, maxBin, currentHour, color, pulse }) {
  const [hover, setHover] = useState(null);

  if (!Array.isArray(bins) || bins.length !== 24) return null;

  const baseColor = color || "#22C55E";
  const negColor = "#EF4444";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        marginTop: 6,
        borderRadius: 4,
        // V1.10.4-r11.0.24.b — micro pulse glow 500ms quand nouvelle activite detectee
        boxShadow: pulse ? `0 0 10px ${baseColor}55, 0 0 4px ${baseColor}30` : "0 0 0 transparent",
        transition: "box-shadow 350ms ease-out",
      }}
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: SVG_H, display: "block" }}
        aria-label="Activité 24h"
      >
        {bins.map((b, h) => {
          const amp = Math.max(b.positive, b.negative);
          const ratio = maxBin > 0 ? amp / maxBin : 0;
          // hauteur min = 1px si pas d'action (baseline visuelle subtile)
          const barH = b.count > 0 ? Math.max(2, ratio * SVG_H) : 1;
          const x = h * BAR_W;
          const y = SVG_H - barH;
          const isCurrent = h === currentHour;
          const isPast = h < currentHour;
          // couleur : negative dominante = rouge, sinon vert/gris selon current/past
          let fill;
          if (b.count === 0) {
            fill = T.border;
          } else if (b.negative > b.positive) {
            fill = isCurrent ? negColor : negColor + "70";
          } else {
            fill = isCurrent ? baseColor : isPast ? baseColor + "80" : baseColor + "40";
          }
          return (
            <rect
              key={h}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, BAR_W - 1)}
              height={barH}
              fill={fill}
              rx={0.5}
              style={{ cursor: b.count > 0 ? "pointer" : "default" }}
              onMouseEnter={() => b.count > 0 && setHover(h)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {/* Tooltip ligne unique - reservation espace pour eviter layout shift */}
      <div
        style={{
          minHeight: 12,
          marginTop: 2,
          fontSize: 9,
          color: T.text3,
          textAlign: "center",
          fontWeight: 600,
          pointerEvents: "none",
          letterSpacing: 0.2,
        }}
      >
        {hover != null && bins[hover] && bins[hover].count > 0 ? (
          <span style={{ color: T.text2 }}>
            {String(hover).padStart(2, "0")}h → {String(hover + 1).padStart(2, "0")}h&nbsp;:&nbsp;
            <strong style={{ color: bins[hover].negative > bins[hover].positive ? negColor : baseColor }}>
              {bins[hover].count} action{bins[hover].count > 1 ? "s" : ""}
            </strong>
          </span>
        ) : (
          <span style={{ opacity: 0.5 }}>Activité 24h</span>
        )}
      </div>
    </div>
  );
});

export default EnergySparkline;
