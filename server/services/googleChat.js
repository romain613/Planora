/**
 * Google Chat Webhook Notifications
 * Send booking events to Google Chat spaces via incoming webhooks
 */

/**
 * Send a message to a Google Chat space via webhook
 */
export async function sendChatNotification(webhookUrl, message) {
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`\x1b[33m[GOOGLE CHAT]\x1b[0m Notification sent`);
  } catch (err) {
    console.error('[GOOGLE CHAT ERROR]', err.message);
  }
}

/**
 * Format a new booking notification for Google Chat
 */
export function formatNewBooking(booking, calendarName, collaboratorName, companyName) {
  return {
    cardsV2: [{
      cardId: `booking-${booking.id}`,
      card: {
        header: {
          title: '📅 Nouveau rendez-vous',
          subtitle: companyName,
          imageUrl: 'https://calendar360.fr/favicon.svg',
          imageType: 'CIRCLE',
        },
        sections: [{
          widgets: [
            { decoratedText: { topLabel: 'Visiteur', text: `<b>${booking.visitorName}</b>`, startIcon: { knownIcon: 'PERSON' } } },
            { decoratedText: { topLabel: 'Calendrier', text: calendarName, startIcon: { knownIcon: 'BOOKMARK' } } },
            { decoratedText: { topLabel: 'Date & heure', text: `${booking.date} à ${booking.time} (${booking.duration}min)`, startIcon: { knownIcon: 'CLOCK' } } },
            ...(collaboratorName ? [{ decoratedText: { topLabel: 'Collaborateur', text: collaboratorName, startIcon: { knownIcon: 'MEMBERSHIP' } } }] : []),
            ...(booking.visitorEmail ? [{ decoratedText: { topLabel: 'Email', text: booking.visitorEmail, startIcon: { knownIcon: 'EMAIL' } } }] : []),
          ],
        }],
      },
    }],
  };
}

/**
 * Format a cancelled booking notification
 */
export function formatCancelledBooking(booking, calendarName, collaboratorName, companyName) {
  return {
    cardsV2: [{
      cardId: `cancel-${booking.id}`,
      card: {
        header: {
          title: '❌ Rendez-vous annulé',
          subtitle: companyName,
        },
        sections: [{
          widgets: [
            { decoratedText: { topLabel: 'Visiteur', text: `<b>${booking.visitorName}</b>` } },
            { decoratedText: { topLabel: 'Était prévu', text: `${booking.date} à ${booking.time} — ${calendarName}` } },
            ...(collaboratorName ? [{ decoratedText: { topLabel: 'Collaborateur', text: collaboratorName } }] : []),
          ],
        }],
      },
    }],
  };
}

/**
 * Format a confirmed booking notification
 */
export function formatConfirmedBooking(booking, calendarName, collaboratorName, companyName) {
  return {
    cardsV2: [{
      cardId: `confirmed-${booking.id}`,
      card: {
        header: {
          title: '✅ Rendez-vous confirmé',
          subtitle: companyName,
        },
        sections: [{
          widgets: [
            { decoratedText: { topLabel: 'Visiteur', text: `<b>${booking.visitorName}</b>` } },
            { decoratedText: { topLabel: 'Calendrier', text: calendarName } },
            { decoratedText: { topLabel: 'Date & heure', text: `${booking.date} à ${booking.time} (${booking.duration}min)` } },
            ...(collaboratorName ? [{ decoratedText: { topLabel: 'Collaborateur', text: collaboratorName } }] : []),
          ],
        }],
      },
    }],
  };
}

/**
 * Format daily summary
 */
export function formatDailySummary(date, bookings, companyName) {
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  const pending = bookings.filter(b => b.status === 'pending').length;
  const cancelled = bookings.filter(b => b.status === 'cancelled').length;

  return {
    cardsV2: [{
      cardId: `summary-${date}`,
      card: {
        header: {
          title: `📊 Résumé du ${date}`,
          subtitle: companyName,
        },
        sections: [{
          widgets: [
            { decoratedText: { text: `<b>${bookings.length}</b> rendez-vous au total` } },
            { decoratedText: { text: `✅ ${confirmed} confirmés · ⏳ ${pending} en attente · ❌ ${cancelled} annulés` } },
          ],
        }],
      },
    }],
  };
}
