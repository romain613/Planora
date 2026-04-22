// Phase 14a — extracted CRM tab from CollabPortal.jsx (was lines 3689-5328).
// Contient 3 sections logiques :
//   1. CRM List/Pipeline view (anciennement `{portalTab === "crm" && (...)}`)
//   2. NewContact modal (anciennement entre les 2 blocs, contrôlé par showNewContact)
//   3. Contact sheet modal (anciennement `{selectedCrmContact && portalTab === "crm" && (...)}`)
//
// TODO Phase future : sub-découper en crm/CrmList.jsx + crm/NewContactModal.jsx + crm/CrmContactSheet.jsx

import React from "react";
import { useCollabContext } from "../context/CollabContext";
import AddStageModal from "../components/AddStageModal";
import EditStageModal from "../components/EditStageModal";
import DeleteStageConfirmModal from "../components/DeleteStageConfirmModal";
import CrmHeader from "./crm/CrmHeader";
import CrmDashboardView from "./crm/CrmDashboardView";
import CrmFiltersBar from "./crm/CrmFiltersBar";
import CrmTableView from "./crm/CrmTableView";
import CrmKanbanView from "./crm/CrmKanbanView";
import FicheContactModal from "./crm/fiche/FicheContactModal";

const CrmTab = () => {
  // CrmTab est un orchestrateur : chaque sous-composant consomme son context
  // directement via useCollabContext(). Seul le switch de vue reste ici.
  const { collabCrmViewMode } = useCollabContext();

  return (
    <>
<div>
  <CrmHeader />

  <CrmFiltersBar />

  <CrmTableView />

  {/* ═══ KANBAN OR DASHBOARD VIEWS ═══ */}
  {collabCrmViewMode === "table" ? null : collabCrmViewMode === "pipeline" ? (
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
