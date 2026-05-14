// QuickModuleNav.jsx — V1.10.4-r11.0.22
//
// Barre de navigation rapide transversale (Pipeline / Agenda / CRM / Campagnes /
// SMS / Scripts / Stats). Unique source de verite UI partagee entre PhoneTab,
// AgendaTab et CrmTab. Cursor pointer (pas grab), tooltip obligatoire au hover,
// aria-label a11y, badges pour SMS unread et Campaigns count.
//
// Comportement navigation :
// - Click sur un item NON actif : setPortalTab + setPhoneSubTab si besoin
// - Click sur item ACTIF en PhoneTab : toggle vers 'conversations' (preserve UX existante)
// - Click sur item ACTIF hors PhoneTab : no-op (vue deja visible)
//
// Note : drag-reorder retire (r11.0.22) — la barre est suffisamment compacte pour
// ne pas necessiter de re-ordre, et le drag rendait l'UX de clic confuse.

import React from "react";
import { T } from "../../../theme";
import { I } from "../../../shared/ui";
import { useCollabContext } from "../context/CollabContext";

const QUICK_MODULES = [
  { key: "pipeline",  label: "Pipeline",  icon: "trello",         portalTab: "phone",  phoneSubTab: "pipeline" },
  { key: "agenda",    label: "Agenda",    icon: "calendar",       portalTab: "agenda", phoneSubTab: null },
  { key: "crm",       label: "CRM",       icon: "users",          portalTab: "crm",    phoneSubTab: null },
  { key: "campaigns", label: "Campagnes", icon: "zap",            portalTab: "phone",  phoneSubTab: "campaigns" },
  { key: "sms",       label: "SMS",       icon: "message-circle", portalTab: "phone",  phoneSubTab: "sms" },
  { key: "scripts",   label: "Scripts",   icon: "file-text",      portalTab: "phone",  phoneSubTab: "scripts" },
  { key: "stats",     label: "Stats",     icon: "bar-chart-2",    portalTab: "phone",  phoneSubTab: "stats" },
];

const BADGE_COLORS = {
  sms: "#0EA5E9",
  campaigns: "#F59E0B",
};

const QuickModuleNav = () => {
  const ctx = useCollabContext() || {};
  const {
    portalTab,
    setPortalTab,
    phoneSubTab,
    setPhoneSubTab,
    appConversations,
    phoneCampaigns,
  } = ctx;

  // Active key : match portalTab + phoneSubTab combination
  let activeKey = "";
  if (portalTab === "phone" && phoneSubTab) {
    const m = QUICK_MODULES.find(
      (x) => x.portalTab === "phone" && x.phoneSubTab === phoneSubTab
    );
    if (m) activeKey = m.key;
  } else if (portalTab === "agenda") activeKey = "agenda";
  else if (portalTab === "crm") activeKey = "crm";

  // Badges
  const unreadSMS = (appConversations || []).reduce(
    (s, c) => s + ((c.lastEventType || "").includes("sms") ? c.unreadCount || 0 : 0),
    0
  );
  const campaignsCount = (phoneCampaigns || []).length;
  const badges = {
    sms: unreadSMS || null,
    campaigns: campaignsCount || null,
  };

  const handleNavigate = (mod) => {
    const isActive = activeKey === mod.key;
    // Preserve PhoneTab UX : clic sur phoneSubTab actif → toggle vers 'conversations'
    if (
      isActive &&
      mod.portalTab === "phone" &&
      mod.phoneSubTab &&
      portalTab === "phone" &&
      typeof setPhoneSubTab === "function"
    ) {
      setPhoneSubTab("conversations");
      return;
    }
    if (typeof setPortalTab === "function") setPortalTab(mod.portalTab);
    if (mod.phoneSubTab && typeof setPhoneSubTab === "function") {
      setPhoneSubTab(mod.phoneSubTab);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Navigation rapide modules"
      style={{
        display: "flex",
        gap: 2,
        alignItems: "center",
        background: T.bg,
        borderRadius: 12,
        padding: "3px 4px",
        border: `1px solid ${T.border}`,
        flexShrink: 0,
        width: "fit-content",
      }}
    >
      {QUICK_MODULES.map((mod) => {
        const active = activeKey === mod.key;
        const badge = badges[mod.key];
        const badgeColor = BADGE_COLORS[mod.key] || T.accent;
        return (
          <div
            key={mod.key}
            role="tab"
            aria-selected={active}
            aria-label={mod.label}
            title={mod.label}
            tabIndex={0}
            onClick={() => handleNavigate(mod)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleNavigate(mod); } }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: "7px 12px",
              borderRadius: 9,
              cursor: "pointer",
              background: active ? T.accentBg : "transparent",
              color: active ? T.accent : T.text3,
              fontWeight: active ? 700 : 500,
              fontSize: 11,
              transition: "all .15s",
              outline: "none",
              userSelect: "none",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.surface; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            onFocus={(e) => { if (!active) e.currentTarget.style.background = T.surface; }}
            onBlur={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <I n={mod.icon} s={15} />
            <span style={{ display: active ? "inline" : "none", fontSize: 11, fontWeight: 700 }}>
              {mod.label}
            </span>
            {badge > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: badgeColor,
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 1px 4px ${badgeColor}40`,
                }}
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QuickModuleNav;
