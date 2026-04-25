// MiniMonthCalendar — composant calendrier mois réutilisable (grid 7 colonnes).
// Props :
//   - value       : string "YYYY-MM-DD" ou "" — jour actuellement sélectionné
//   - onChange    : (iso) => void — déclenché au clic sur un jour cliquable
//   - minDate     : string "YYYY-MM-DD" — jour minimum cliquable (défaut = aujourd'hui)
//   - maxMonthsAhead : number — nombre max de mois navigables depuis le mois courant (défaut 12)
//
// Règles UX :
//   - jours passés désactivés (grisés)
//   - jour sélectionné surligné (primary #2563EB)
//   - aujourd'hui marqué par une bordure fine
//   - pas de saisie clavier nécessaire
//
// Pas de dépendance context. Pas d'effet de bord. Sûr à monter dans des modals
// ou des panneaux latéraux.

import React, { useState } from "react";
import { T } from "../../theme";
import { DAYS_SHORT, MONTHS_FR } from "../utils/dates";

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

const MiniMonthCalendar = ({ value, onChange, minDate, maxMonthsAhead = 12 }) => {
  const todayIso = new Date().toISOString().split("T")[0];
  const min = minDate || todayIso;

  const initDate = value ? new Date(value + "T00:00:00") : new Date();
  const [view, setView] = useState(() => new Date(initDate.getFullYear(), initDate.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ empty: true, key: "pre-" + i });
  for (let d = 1; d <= daysInMonth; d++) {
    const d_iso = iso(year, month, d);
    cells.push({
      day: d,
      iso: d_iso,
      isSelected: d_iso === value,
      isPast: d_iso < min,
      isToday: d_iso === todayIso,
      key: d_iso,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true, key: "post-" + cells.length });

  const monthsFromNow = (() => {
    const now = new Date();
    return (year - now.getFullYear()) * 12 + (month - now.getMonth());
  })();
  const canPrev = monthsFromNow > 0;
  const canNext = monthsFromNow < maxMonthsAhead - 1;

  const nav = (dir) => setView(new Date(year, month + dir, 1));

  const navBtn = (dir, enabled, label) => (
    <button
      type="button"
      onClick={enabled ? () => nav(dir) : undefined}
      disabled={!enabled}
      aria-label={dir < 0 ? "Mois précédent" : "Mois suivant"}
      style={{
        width: 28,
        height: 28,
        border: "none",
        background: "transparent",
        cursor: enabled ? "pointer" : "not-allowed",
        color: enabled ? T.text2 : T.text3,
        opacity: enabled ? 1 : 0.35,
        borderRadius: 8,
        fontSize: 20,
        lineHeight: 1,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { if (enabled) e.currentTarget.style.background = "#f3f4f6"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        border: "1px solid " + (T.border || "#e5e7eb"),
        borderRadius: 12,
        padding: 10,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        {navBtn(-1, canPrev, "‹")}
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text || "#111", textTransform: "capitalize" }}>
          {MONTHS_FR[month]} {year}
        </div>
        {navBtn(1, canNext, "›")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAYS_SHORT.map((d) => (
          <div
            key={d}
            style={{ fontSize: 10, fontWeight: 600, color: T.text3 || "#9ca3af", textAlign: "center", padding: "4px 0" }}
          >
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((c) =>
          c.empty ? (
            <div key={c.key} style={{ height: 32 }} />
          ) : (
            <button
              key={c.key}
              type="button"
              disabled={c.isPast}
              onClick={() => !c.isPast && onChange && onChange(c.iso)}
              aria-label={c.iso}
              aria-pressed={c.isSelected}
              style={{
                height: 32,
                border: c.isToday && !c.isSelected ? "1px solid #2563EB60" : "1px solid transparent",
                borderRadius: 8,
                background: c.isSelected ? "#2563EB" : "transparent",
                color: c.isSelected ? "#fff" : c.isPast ? "#d1d5db" : T.text || "#111",
                fontSize: 12,
                fontWeight: c.isSelected || c.isToday ? 700 : 500,
                cursor: c.isPast ? "not-allowed" : "pointer",
                transition: "background .12s, color .12s",
                fontFamily: "inherit",
                padding: 0,
              }}
              onMouseEnter={(e) => { if (!c.isPast && !c.isSelected) e.currentTarget.style.background = "#f3f4f6"; }}
              onMouseLeave={(e) => { if (!c.isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              {c.day}
            </button>
          ),
        )}
      </div>
    </div>
  );
};

export default MiniMonthCalendar;
