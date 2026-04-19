// utils/notifications.js — Phase 2 extraction (pure helpers/data, no scope deps)

export const sendNotification = async (type, data) => {
  try {
    const res = await fetch(`/api/notify/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    console.log(`[NOTIFY:${type}]`, result.success ? '✅' : '❌', data.visitorName);
    return result;
  } catch (e) {
    console.warn(`[NOTIFY:${type}] ⚠️ Failed:`, e.message);
    return { success: false, error: e.message };
  }
};

export const buildNotifyPayload = (booking, calendars, collabs, company) => ({
  visitorName: booking.visitorName || '',
  visitorEmail: booking.visitorEmail || '',
  visitorPhone: booking.visitorPhone || '',
  date: booking.date,
  time: booking.time,
  duration: booking.duration || 30,
  calendarName: calendars?.find(c => c.id === booking.calendarId)?.name || '',
  collaboratorName: collabs?.find(c => c.id === booking.collaboratorId)?.name || '',
  companyName: company?.name || '',
  location: calendars?.find(c => c.id === booking.calendarId)?.location || '',
});
