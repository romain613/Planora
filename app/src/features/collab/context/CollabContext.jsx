// Phase 10 — CollabContext (additive: doesn't move useState, just exposes existing state/setters
// from CollabPortal scope to extracted tab components).
//
// Usage in CollabPortal.jsx:
//   import { CollabProvider } from "./context/CollabContext";
//   <CollabProvider value={{ collab, showNotif, aiProfileTab, setAiProfileTab, ... }}>
//     <existing JSX>
//   </CollabProvider>
//
// Usage in extracted tabs (features/collab/tabs/*.jsx):
//   import { useCollabContext } from "../context/CollabContext";
//   const { collab, showNotif, aiProfileTab, ... } = useCollabContext();

import { createContext, useContext } from "react";

const CollabContext = createContext(null);

export const CollabProvider = CollabContext.Provider;

export const useCollabContext = () => {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error("useCollabContext must be used within CollabProvider");
  return ctx;
};
