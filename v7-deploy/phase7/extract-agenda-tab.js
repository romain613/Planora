#!/usr/bin/env node
// Phase 13b — extract Agenda tab from CollabPortal.jsx into features/collab/tabs/AgendaTab.jsx
// Block: {portalTab === "agenda" && (<div>...</div>)} — JSX direct, not IIFE.

const fs = require('fs');
const path = require('path');

const PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');
const TARGET = path.resolve(__dirname, '../../app/src/features/collab/tabs/AgendaTab.jsx');

const src = fs.readFileSync(PATH, 'utf8');
const lines = src.split('\n');

const START_PATTERN = '{portalTab === "agenda" && (';
let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(START_PATTERN) && !lines[i].includes('=>')) { startIdx = i; break; }
}
if (startIdx === -1) { console.error('start not found'); process.exit(1); }

let endIdx = -1;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i] === '        )}') { endIdx = i; break; }
}
if (endIdx === -1) { console.error('end not found'); process.exit(1); }

console.log(`Agenda block: lines ${startIdx + 1} → ${endIdx + 1} (${endIdx - startIdx + 1} lines)`);

// Body = lines startIdx+1 to endIdx-1 (skip the wrapping `{cond && (` and `)}`)
const bodyLines = lines.slice(startIdx + 1, endIdx);
// Strip 10-space indent (each line is at least at 10 spaces given JSX structure)
const dedented = bodyLines.map(l => l.startsWith('          ') ? l.slice(10) : (l.startsWith('        ') ? l.slice(8) : l));

const header = `// Phase 13b — extracted Agenda tab from CollabPortal.jsx (was lines ${startIdx + 1}-${endIdx + 1}).

import React from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Spinner } from "../../../shared/ui";
import { DAYS_FR, DAYS_SHORT, MONTHS_FR, getDow, fmtDate } from "../../../shared/utils/dates";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";

const AgendaTab = () => {
  const {
    collab, company, showNotif,
    bookings, contacts,
    calendars, setCalendars,
    weekOffset, setWeekOffset,
    monthOffset, setMonthOffset,
    selectedDay, setSelectedDay,
    selectedBooking, setSelectedBooking,
    calAccordionOpen, setCalAccordionOpen,
    mrStatusFilter, setMrStatusFilter,
    editCalModal, setEditCalModal,
    editCalSlugAvail, setEditCalSlugAvail,
    actionLoading, setActionLoading,
    viewMode, setViewMode,
    agendaZoom, setAgendaZoom,
    agendaWorkHours, setAgendaWorkHours,
    gridThemeId, setGridThemeId,
    customGridColors, setCustomGridColors,
    showGridColors, setShowGridColors,
    gridColorPresets,
    myBookings, myCalendars, monthDays, agendaFillRate,
    getBookingAt, getGoogleEventAt, updateBooking,
    portalTab, setPortalTab, setPortalTabKey,
    setPhoneScheduleForm, setPhoneShowScheduleModal,
  } = useCollabContext();

  return (
`;

const footer = `  );
};

export default AgendaTab;
`;

const newFileContent = header + dedented.join('\n') + '\n' + footer;

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`${PATH}.pre-agenda-${ts}`, src);
fs.writeFileSync(TARGET, newFileContent);
console.log(`Wrote: ${TARGET} (${newFileContent.split('\n').length} lines)`);

const REPLACEMENT = '        {portalTab === "agenda" && <AgendaTab/>}';
const newLines = [...lines.slice(0, startIdx), REPLACEMENT, ...lines.slice(endIdx + 1)];
fs.writeFileSync(PATH, newLines.join('\n'));
console.log(`Rewrote CollabPortal: ${newLines.length} lines (was ${lines.length}, diff -${lines.length - newLines.length})`);
