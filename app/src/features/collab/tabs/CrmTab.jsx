// Phase 14a — extracted CRM tab from CollabPortal.jsx (was lines 3689-5328).
// Contient 3 sections logiques :
//   1. CRM List/Pipeline view (anciennement `{portalTab === "crm" && (...)}`)
//   2. NewContact modal (anciennement entre les 2 blocs, contrôlé par showNewContact)
//   3. Contact sheet modal (anciennement `{selectedCrmContact && portalTab === "crm" && (...)}`)
//
// TODO Phase future : sub-découper en crm/CrmList.jsx + crm/NewContactModal.jsx + crm/CrmContactSheet.jsx

import React, { useState, useMemo, useEffect, Fragment } from "react";
import { T } from "../../../theme";
import { I, Btn, Card, Avatar, Badge, Modal, Input, ValidatedInput, Stars, Spinner, EmptyState, HelpTip, HookIsolator } from "../../../shared/ui";
import { displayPhone, formatPhoneFR } from "../../../shared/utils/phone";
import { isValidEmail, isValidPhone } from "../../../shared/utils/validators";
import { fmtDate, DAYS_FR, MONTHS_FR } from "../../../shared/utils/dates";
import { PIPELINE_CARD_COLORS_DEFAULT, RDV_CATEGORIES } from "../../../shared/utils/pipeline";
import { sendNotification, buildNotifyPayload } from "../../../shared/utils/notifications";
import { api } from "../../../shared/services/api";
import { _T } from "../../../shared/state/tabState";
import { useCollabContext } from "../context/CollabContext";
import { FicheClientMsgScreen, FicheSuiviScreen, FicheDocsLinkedScreen } from "../screens";
import AddStageModal from "../components/AddStageModal";
import EditStageModal from "../components/EditStageModal";
import DeleteStageConfirmModal from "../components/DeleteStageConfirmModal";
import BulkSmsModal from "../components/BulkSmsModal";
import CrmHeader from "./crm/CrmHeader";
import CrmDashboardView from "./crm/CrmDashboardView";
import CrmFiltersBar from "./crm/CrmFiltersBar";
import CrmTableView from "./crm/CrmTableView";
import CrmKanbanView from "./crm/CrmKanbanView";
import FicheContactModal from "./crm/fiche/FicheContactModal";

const CrmTab = () => {
  const ctx = useCollabContext();
  // Destructure ALL refs CRM tab needs (~80 refs from context)
  const {
    collab, company, contacts, bookings, collabs, showNotif,
    fmtDur,
    cScoreColor, cScoreLabel,
    handleCollabUpdateContact,
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
    // ═══ REWIRE 2026-04-20 — destructure complémentaire (35 symboles) ═══
    CRM_STD_COLS,
    appMyPhoneNumbers,
    calendars,
    collabContactTags,
    collabNotesTimerRef,
    collabPaginatedContacts,
    collabPipelineAnalytics,
    contactsLocalEditRef,
    contactsRef,
    getCollabLeadScore,
    handleAddCustomStage,
    handleCollabCreateContact,
    handleCollabDeleteContact,
    handleColumnDragEnd,
    handleColumnDragStart,
    handleColumnDrop,
    handleDeleteCustomStage,
    handleDragEnd,
    handleDragLeave,
    handleDragOver,
    handleDragStart,
    handleDrop,
    handlePipelineStageChange,
    handleUpdateCustomStage,
    // Phase 4 Templates — verrou runtime pipeline
    pipelineReadOnly, pipelineTemplateMeta,
    linkVisitorToContacts,
    myCrmContacts,
    phoneCallAnalyses,
    phoneCallRecordings,
    prefillKeypad,
    setV7TransferModal,
    setV7TransferTarget,
    startVoipCall,
    today,
    v7FollowersMap,
    voipCallLogs,
  } = ctx;

  return (
    <>
<div>
  <CrmHeader />

  <CrmFiltersBar />

  <CrmTableView />

  {/* ═══ KANBAN OR DASHBOARD VIEWS ═══ */}
  {collabCrmViewMode === "table" ? null : (typeof collabCrmViewMode!=='undefined'?collabCrmViewMode:null) === "pipeline" ? (
    <CrmKanbanView />
  ) : (
    <CrmDashboardView />
  )}

  <EditStageModal />

  <DeleteStageConfirmModal />
</div>

<AddStageModal />

  <FicheContactModal />
    </>
  );
};

export default CrmTab;
