// ═══════════════════════════════════════════════════════════════════════════
// ContactShareModal V1 — Partage contact + prise de RDV chez un collègue
// ═══════════════════════════════════════════════════════════════════════════
//
// Flow :
//   1. Collab sélectionne un destinataire (dropdown de collaborateurs de la company)
//   2. Saisit date + heure + durée + note de transmission
//   3. Choisit le calendrier cible du destinataire (si plusieurs)
//   4. Submit → POST /api/contact-share/send (atomique backend)
//   5. Le contact apparaît chez le destinataire avec badge orange
//
// Principe : modal léger, pas de disponibilités temps réel (V1 simple).

import React, { useState, useMemo, useEffect } from "react";
import { T } from "../../../theme";
import { I, Btn, Modal, Input, Spinner } from "../../../shared/ui";
import { api } from "../../../shared/services/api";

export default function ContactShareModal({
  open,
  onClose,
  contact,
  currentCollabId,
  companyId,
  collaborators = [],
  calendars = [],
  showNotif,
  onSuccess,
}) {
  // ── Targets : collabs de la company sauf le caller
  const targets = useMemo(() => {
    return (collaborators || [])
      .filter((c) => c && c.id && c.id !== currentCollabId)
      .filter((c) => !companyId || c.companyId === companyId);
  }, [collaborators, currentCollabId, companyId]);

  const [targetId, setTargetId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("10:00");
  const [bookingDuration, setBookingDuration] = useState(30);
  const [calendarId, setCalendarId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setTargetId("");
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setBookingDate(tomorrow.toISOString().split("T")[0]);
      setBookingTime("10:00");
      setBookingDuration(30);
      setCalendarId("");
      setNote("");
      setSubmitting(false);
    }
  }, [open, contact?.id]);

  // Calendriers du destinataire sélectionné
  const targetCalendars = useMemo(() => {
    if (!targetId) return [];
    // Pas de champ collaboratorId strict sur calendars → on liste tous les calendars de la company
    return (calendars || []).filter((c) => !companyId || c.companyId === companyId);
  }, [targetId, calendars, companyId]);

  // Auto-sélectionner le premier calendrier
  useEffect(() => {
    if (targetId && targetCalendars.length > 0 && !calendarId) {
      setCalendarId(targetCalendars[0].id);
    }
  }, [targetId, targetCalendars, calendarId]);

  const targetCollab = targets.find((c) => c.id === targetId);

  const canSubmit =
    !!targetId &&
    !!bookingDate &&
    !!bookingTime &&
    !!calendarId &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await api("/api/contact-share/send", {
        method: "POST",
        body: {
          contactId: contact.id,
          targetCollaboratorId: targetId,
          bookingDate,
          bookingTime,
          bookingDuration,
          calendarId,
          note: note.trim() || undefined,
          companyId,
        },
      });
      if (r?.error) throw new Error(r.error);
      if (showNotif) {
        showNotif(
          `Contact partagé avec ${targetCollab?.name || "le collaborateur"}${r.bookingId ? " — RDV programmé" : ""}`,
          "success"
        );
      }
      if (onSuccess) onSuccess(r);
      onClose();
    } catch (e) {
      console.error("[ContactShareModal.send]", e);
      // Message user-friendly pour les cas métiers connus
      let msg = e.message;
      if (msg === 'CONTACT_ALREADY_SHARED') msg = "Ce contact est déjà partagé. Désynchronisez d'abord avant de le partager à nouveau.";
      else if (msg === 'CANNOT_SHARE_WITH_SELF') msg = "Vous ne pouvez pas vous envoyer un contact à vous-même.";
      else if (msg === 'NOT_AUTHORIZED_ON_CONTACT') msg = "Vous n'avez pas l'autorisation de partager ce contact.";
      else if (msg === 'SLOT_CONFLICT') msg = "Ce créneau est déjà réservé.";
      if (showNotif) showNotif("Erreur : " + msg, "danger");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={true} onClose={onClose} title={`Envoyer ${contact?.name || "le contact"} à un collègue`} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Bandeau contact */}
        <div
          style={{
            padding: "10px 12px", borderRadius: 8,
            background: T.surface, border: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <I n="user" s={16} style={{ color: T.text3 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{contact?.name || "—"}</div>
            <div style={{ fontSize: 11, color: T.text3 }}>
              {contact?.email || ""}{contact?.email && contact?.phone ? " · " : ""}{contact?.phone || ""}
            </div>
          </div>
        </div>

        {/* Destinataire */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 5 }}>
            Destinataire <span style={{ color: T.danger }}>*</span>
          </label>
          <select
            value={targetId}
            onChange={(e) => { setTargetId(e.target.value); setCalendarId(""); }}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13,
            }}
          >
            <option value="">— Sélectionner un collaborateur —</option>
            {targets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.role === "admin" ? " (admin)" : ""}
              </option>
            ))}
          </select>
          {targets.length === 0 && (
            <div style={{ fontSize: 11, color: T.text3, marginTop: 4, fontStyle: "italic" }}>
              Aucun autre collaborateur dans votre équipe.
            </div>
          )}
        </div>

        {/* Date + heure + durée */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text2, display: "block", marginBottom: 4 }}>Date RDV</label>
            <input
              type="date"
              value={bookingDate}
              onChange={(e) => setBookingDate(e.target.value)}
              style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text2, display: "block", marginBottom: 4 }}>Heure</label>
            <input
              type="time"
              value={bookingTime}
              onChange={(e) => setBookingTime(e.target.value)}
              style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text2, display: "block", marginBottom: 4 }}>Durée (min)</label>
            <input
              type="number"
              value={bookingDuration}
              onChange={(e) => setBookingDuration(parseInt(e.target.value, 10) || 30)}
              min={10} max={240} step={5}
              style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12 }}
            />
          </div>
        </div>

        {/* Calendrier */}
        {targetId && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 5 }}>
              Calendrier cible <span style={{ color: T.danger }}>*</span>
            </label>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 8,
                border: `1px solid ${calendarId ? T.border : T.accent + "80"}`,
                background: T.surface, color: T.text, fontSize: 13,
              }}
            >
              <option value="">— Sélectionner un calendrier —</option>
              {targetCalendars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {targetCalendars.length === 0 && (
              <div style={{ fontSize: 11, color: T.warning, marginTop: 4 }}>
                Aucun calendrier disponible — créez-en un d'abord.
              </div>
            )}
          </div>
        )}

        {/* Note de transmission */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 5 }}>
            Note de transmission
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contexte pour le collègue (lead chaud, besoin client, etc.)"
            rows={3}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface, color: T.text,
              fontSize: 12, fontFamily: "inherit", resize: "vertical",
            }}
          />
        </div>

        <div
          style={{
            padding: "8px 10px", borderRadius: 6,
            background: "#F9731612", border: "1px solid #F9731640",
            fontSize: 11, color: T.text2,
          }}
        >
          <I n="info" s={11} style={{ color: "#F97316", marginRight: 4 }} />
          Le contact restera dans votre pipeline avec un badge orange. Un RDV sera créé dans l'agenda du destinataire. Vous pourrez vous désynchroniser à tout moment.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Btn onClick={onClose} disabled={submitting}>Annuler</Btn>
          <Btn primary onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <><Spinner/> Envoi…</> : <><I n="send" s={12}/> Envoyer + programmer le RDV</>}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
