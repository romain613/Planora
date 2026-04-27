// Phase R1 (V1.10.0) — Lecture d'un snapshot collab : décompresse + vérifie SHA-256 + parse JSON.
//
// PURE READ : aucun effet de bord DB / filesystem / process.
// Validation forte : SHA-256 mismatch ou version non supportée → throw immédiat (anti-corruption silencieuse).
//
// Source unique du payload pour previewRestore.js et restoreSnapshot.js.

import { readFileSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import path from 'path';
import { db } from '../../db/database.js';
import { COLLAB_SNAPSHOT_VERSION } from './scope.js';

const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || '/var/www/planora-data/snapshots';

// Versions de payload acceptées (pour future-proofing : ajouter ici quand le schéma change).
const SUPPORTED_PAYLOAD_VERSIONS = [COLLAB_SNAPSHOT_VERSION];

/**
 * Lit un snapshot par son ID DB, vérifie l'intégrité, retourne row metadata + payload parsé.
 *
 * @param {number|string} snapshotId
 * @returns {{ snap: object, payload: object }}
 * @throws si snapshot introuvable, fichier manquant, SHA-256 mismatch, version non supportée
 */
export function readSnapshot(snapshotId) {
  const id = Number(snapshotId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`readSnapshot: snapshotId invalide (${snapshotId})`);
  }

  // 1. Row metadata
  const snap = db
    .prepare('SELECT * FROM collab_snapshots WHERE id = ?')
    .get(id);
  if (!snap) {
    throw new Error(`readSnapshot: snapshot ${id} introuvable en base`);
  }

  // 2. Fichier sur disque
  const fullPath = path.isAbsolute(snap.payloadPath)
    ? snap.payloadPath
    : path.join(SNAPSHOTS_DIR, snap.payloadPath);

  if (!existsSync(fullPath)) {
    throw new Error(
      `readSnapshot: fichier snapshot manquant pour id=${id} path=${snap.payloadPath}`
    );
  }

  // 3. Lecture + vérification intégrité SHA-256
  const gzipped = readFileSync(fullPath);
  const sha256 = createHash('sha256').update(gzipped).digest('hex');
  if (sha256 !== snap.payloadSha256) {
    throw new Error(
      `readSnapshot: SHA-256 mismatch pour snapshot ${id} (corruption détectée). ` +
        `expected=${snap.payloadSha256.slice(0, 16)}... got=${sha256.slice(0, 16)}...`
    );
  }

  // 4. Décompression + parsing
  let payload;
  try {
    const jsonStr = gunzipSync(gzipped).toString('utf8');
    payload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `readSnapshot: payload corrompu (gunzip ou JSON parse failed) pour id=${id}: ${err.message}`
    );
  }

  // 5. Validation structure + version
  if (!payload || typeof payload !== 'object') {
    throw new Error(`readSnapshot: payload vide pour id=${id}`);
  }
  if (!payload.meta || !payload.tables) {
    throw new Error(`readSnapshot: payload structure invalide pour id=${id} (manque meta/tables)`);
  }
  const payloadVersion = payload.meta.version;
  if (!SUPPORTED_PAYLOAD_VERSIONS.includes(payloadVersion)) {
    throw new Error(
      `readSnapshot: version payload non supportée (${payloadVersion}) pour id=${id}. ` +
        `Versions supportées: [${SUPPORTED_PAYLOAD_VERSIONS.join(', ')}]`
    );
  }

  return { snap, payload };
}
