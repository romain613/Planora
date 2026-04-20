#!/usr/bin/env node
// Phase 14a — extract CRM tab from CollabPortal.jsx into features/collab/tabs/CrmTab.jsx
// CRM has 3 separate JSX blocks:
//   1. Main pipeline/list view: lines 3633-4347 (`{portalTab === "crm" && (`)
//   2. NewContact modal: lines ~4350-4463 (between blocks, controlled by showNewContact)
//   3. Contact sheet modal: lines 4465-5272 (`{selectedCrmContact && portalTab === "crm" && (`)
//
// Strategy: extract all 3 blocks into a single CrmTab.jsx that renders them sequentially.
// Replace the 3 blocks in CollabPortal with a single `{portalTab === "crm" && <CrmTab/>}`.

const fs = require('fs');
const path = require('path');

const PATH = path.resolve(__dirname, '../../app/src/features/collab/CollabPortal.jsx');
const TARGET = path.resolve(__dirname, '../../app/src/features/collab/tabs/CrmTab.jsx');

const src = fs.readFileSync(PATH, 'utf8');
const lines = src.split('\n');

// Find all 3 block boundaries
function findBlockEnd(startIdx, openChar, closeChar) {
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    for (const c of lines[i]) {
      if (c === openChar) depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) {
          // Verify this line ends with the closing pattern
          if (lines[i].trim().endsWith(closeChar + '}') || lines[i].trim() === ')}' ) return i;
        }
      }
    }
  }
  return -1;
}

let block1Start = -1, block3Start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('{portalTab === "crm" && (') && !lines[i].includes('selectedCrmContact')) {
    if (block1Start === -1) block1Start = i;
  }
  if (lines[i].includes('selectedCrmContact') && lines[i].includes('portalTab === "crm"')) {
    block3Start = i;
  }
}
if (block1Start === -1 || block3Start === -1) { console.error('blocks not found'); process.exit(1); }

const block1End = findBlockEnd(block1Start, '(', ')');
const block3End = findBlockEnd(block3Start, '(', ')');

if (block1End === -1 || block3End === -1) { console.error('block ends not found'); process.exit(1); }

console.log(`Block1 (table/pipeline): lines ${block1Start + 1} → ${block1End + 1}`);
console.log(`Block3 (contact sheet): lines ${block3Start + 1} → ${block3End + 1}`);

// Block2 = everything between block1End+1 and block3Start-1 (NewContact modal + comment)
const block2Start = block1End + 1;
const block2End = block3Start - 1;
console.log(`Block2 (NewContact modal + glue): lines ${block2Start + 1} → ${block2End + 1}`);

// Build CrmTab content
const block1Body = lines.slice(block1Start + 1, block1End).join('\n'); // skip the wrapper `{cond && (` and `)}`
const block2Body = lines.slice(block2Start, block2End + 1).join('\n'); // entire region between
const block3Body = lines.slice(block3Start + 1, block3End).join('\n');

// Dedent: strip 8 or 10 spaces depending on context
function dedent(s) {
  return s.split('\n').map(l => l.startsWith('          ') ? l.slice(10) : (l.startsWith('        ') ? l.slice(8) : l)).join('\n');
}

const header = `// Phase 14a — extracted CRM tab from CollabPortal.jsx (was lines ${block1Start+1}-${block3End+1}).
// Contient 3 sections logiques :
//   1. CRM List/Pipeline view (anciennement \`{portalTab === "crm" && (...)}\`)
//   2. NewContact modal (anciennement entre les 2 blocs, contrôlé par showNewContact)
//   3. Contact sheet modal (anciennement \`{selectedCrmContact && portalTab === "crm" && (...)}\`)
//
// TODO Phase future : sub-découper en crm/CrmList.jsx + crm/NewContactModal.jsx + crm/CrmContactSheet.jsx

import React, { useState, useMemo, useEffect, Fragment } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Input, ValidatedInput, Stars, Spinner, EmptyState, HelpTip } from "../../../shared/ui";
import { displayPhone, formatPhoneFR } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { fmtDate, DAYS_FR, MONTHS_FR } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { api } from "../../../shared/services/api";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";

const CrmTab = () => {
  const ctx = useCollabContext();
  // Destructure ALL refs CRM tab needs (~80 refs from context)
  const {
    collab, company, contacts, bookings, collabs, showNotif,
    crmSearch, setCrmSearch,
    collabCrmViewMode, setCollabCrmViewMode,
    collabCrmSortKey, setCollabCrmSortKey,
    collabCrmSortDir, setCollabCrmSortDir,
    collabCrmFilterTags, setCollabCrmFilterTags,
    collabCrmFilterStage, setCollabCrmFilterStage,
    collabCrmFilterFollowup, setCollabCrmFilterFollowup,
    collabCrmSelectedIds, setCollabCrmSelectedIds,
    collabCrmBulkStage, setCollabCrmBulkStage,
    collabCrmPage, setCollabCrmPage,
    collabCrmAdvOpen, setCollabCrmAdvOpen,
    collabCrmAdvFilters, setCollabCrmAdvFilters,
    crmColConfig, setCrmColConfig, saveCrmColConfig,
    crmEffectiveOrder, crmEffectiveHidden, crmVisibleCols,
    crmColPanelOpen, setCrmColPanelOpen,
    crmDragCol, setCrmDragCol,
    crmExportModal, setCrmExportModal,
    filteredCollabCrm, collabCrmTotalPages,
    showNewContact, setShowNewContact,
    newContactForm, setNewContactForm,
    scanImageModal, setScanImageModal,
    csvImportModal, setCsvImportModal,
    showAddStage, setShowAddStage,
    newStageName, setNewStageName,
    newStageColor, setNewStageColor,
    editingStage, setEditingStage,
    editStageForm, setEditStageForm,
    confirmDeleteStage, setConfirmDeleteStage,
    editingContact, setEditingContact,
    contractModal, setContractModal,
    contractForm, setContractForm,
    contactAnalysesHistory, setContactAnalysesHistory,
    contactAnalysesHistoryModal, setContactAnalysesHistoryModal,
    histOpen, setHistOpen,
    statusHist, setStatusHist,
    dragContact, setDragContact,
    dragOverStage, setDragOverStage,
    dragColumnId, setDragColumnId,
    pipelineStages, setPipelineStages,
    contactFieldDefs, setContactFieldDefs,
    pipelinePopupContact, setPipelinePopupContact,
    pipelinePopupHistory, setPipelinePopupHistory,
    pipelineNrpExpanded, setPipelineNrpExpanded,
    pipelineRightContact, setPipelineRightContact,
    pipelineRightTab, setPipelineRightTab,
    pipelineRdvModal, setPipelineRdvModal,
    pipelineRdvForm, setPipelineRdvForm,
    pipeBulkStage, setPipeBulkStage,
    pipeBulkModal, setPipeBulkModal,
    pipeBulkSmsText, setPipeBulkSmsText,
    pipeSelectedIds, setPipeSelectedIds,
    iaHubCollapse, setIaHubCollapse,
    notifList, setNotifList,
    notifUnread, setNotifUnread,
    setBookings, setContacts, setCollabAlertCount,
    orderedStages, PIPELINE_STAGES, CRM_ALL_COLS, DEFAULT_STAGES,
    selectedCrmContact, setSelectedCrmContact,
    collabFicheTab, setCollabFicheTab,
    setRdvPasseModal,
    setPhoneShowScheduleModal, setPhoneScheduleForm,
    portalTab, setPortalTab, setPortalTabKey,
  } = ctx;

  return (
    <>
${dedent(block1Body)}
${dedent(block2Body)}
${dedent(block3Body)}
    </>
  );
};

export default CrmTab;
`;

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(`${PATH}.pre-crm-${ts}`, src);
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, header);
console.log(`Wrote: ${TARGET} (${header.split('\n').length} lines)`);

// Replace the 3 blocks in CollabPortal with a single <CrmTab/>
const REPLACEMENT = '        {portalTab === "crm" && <CrmTab/>}';
const newLines = [
  ...lines.slice(0, block1Start),
  REPLACEMENT,
  ...lines.slice(block3End + 1),
];
fs.writeFileSync(PATH, newLines.join('\n'));
console.log(`Rewrote CollabPortal: ${newLines.length} lines (was ${lines.length}, diff -${lines.length - newLines.length})`);
