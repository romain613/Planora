// ═══════════════════════════════════════════════════════════════════════════
// CollabContext — point de jonction unique entre CollabPortal et tabs extraits.
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE D'ARCHITECTURE — branchement des symboles (IMPÉRATIVE)
//
// Tout symbole (state, setter, helper, handler, ref, const) déclaré au scope
// top-level de CollabPortal ET consommé dans un tab DOIT être explicitement
// routé via ce contexte. 3 étapes obligatoires, aucune exception :
//
//   1. Déclarer le symbole au scope top-level de CollabPortal (indent 2 espaces)
//   2. L'ajouter en shorthand dans <CollabProvider value={{ ... }}>
//   3. Le destructurer dans le tab consommateur :
//        const { symboleX, symboleY } = useCollabContext();
//
// CONTRAINTE NÉGATIVE — aucune référence implicite depuis un tab à un symbole
// de CollabPortal sans passer par ces 3 étapes. Violation → ReferenceError
// au premier render, écran rouge ErrorBoundary.
//
// LOCAL RESTE LOCAL — un symbole utilisé uniquement dans CollabPortal ne doit
// PAS être ajouté au value block. Le context ne transporte QUE ce qui est
// partagé entre ≥1 tab.
//
// NOUVELLE FEATURE — toujours créer le symbole dans le bon emplacement dès
// le départ (CollabPortal si partagé, tab local sinon). Ne jamais laisser
// un ancien chemin vivre à côté d'un nouveau.
//
// AUDIT AUTOMATIQUE — scripts dans ops/smoke/ (V1 static + V3 runtime) à
// relancer après toute extraction de code ou nouvelle feature pour détecter
// d'éventuelles références orphelines au niveau source ou runtime.
//
// Origine : Phase 14b (extraction PhoneTab le 2026-04-20) a révélé la dette
// de branchement implicite accumulée. Règle gravée après rewire complet.
//
// Usage standard :
//   import { CollabProvider } from "./context/CollabContext";
//   <CollabProvider value={{ collab, showNotif, ... }}>{children}</CollabProvider>
//
//   import { useCollabContext } from "../context/CollabContext";
//   const { collab, showNotif, ... } = useCollabContext();

import { createContext, useContext } from "react";

const CollabContext = createContext(null);

export const CollabProvider = CollabContext.Provider;

export const useCollabContext = () => {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error("useCollabContext must be used within CollabProvider");
  return ctx;
};
