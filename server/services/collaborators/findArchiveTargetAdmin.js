// Helper pur — résolution de la cible de réassignation lors d'un archivage collab.
// Priorité stricte (D.3) : 1er admin actif de la même company, ordonné par createdAt ASC.
// Retourne null si aucun admin actif disponible (le caller décide alors d'utiliser le pool unassigned).

export function findArchiveTargetAdmin(db, { companyId, exclude }) {
  if (!companyId) return null;
  // Pas de colonne createdAt sur collaborators : ordre par rowid (ordre d'insertion historique).
  const row = db.prepare(
    "SELECT id FROM collaborators WHERE companyId = ? AND role = 'admin' AND (archivedAt IS NULL OR archivedAt = '') AND id != ? ORDER BY rowid ASC LIMIT 1"
  ).get(companyId, exclude || '');
  return row?.id || null;
}
