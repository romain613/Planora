// Phase S1 — Barrel export du service collab snapshots.
export { buildCollabSnapshot } from './buildCollabSnapshot.js';
export { computeCollabFingerprint } from './fingerprint.js';
export { writeSnapshot, getLastSnapshot } from './writeSnapshot.js';
export {
  COLLAB_SNAPSHOT_VERSION,
  DIRECT_TABLES,
  CONTACT_JOINED_TABLES,
  OUT_OF_SCOPE,
} from './scope.js';
