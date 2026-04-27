// Phase S1 — Barrel export du service collab snapshots.
// Phase R1 (V1.10.0) — Ajout exports restore engine (read/preview/restore).
export { buildCollabSnapshot } from './buildCollabSnapshot.js';
export { computeCollabFingerprint } from './fingerprint.js';
export { writeSnapshot, getLastSnapshot } from './writeSnapshot.js';
export { readSnapshot } from './readSnapshot.js';
export { previewRestore } from './previewRestore.js';
export { restoreSnapshot } from './restoreSnapshot.js';
export {
  COLLAB_SNAPSHOT_VERSION,
  DIRECT_TABLES,
  CONTACT_JOINED_TABLES,
  OUT_OF_SCOPE,
} from './scope.js';
