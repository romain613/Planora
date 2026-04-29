/**
 * Google Tasks Service
 * Create follow-up tasks for collaborators after bookings
 */
import { google } from 'googleapis';
import { db } from '../db/database.js';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Get an authenticated Google Tasks client for a collaborator
 */
function getTasksClient(collaboratorId) {
  const row = db.prepare('SELECT google_tokens_json FROM collaborators WHERE id = ?').get(collaboratorId);
  if (!row?.google_tokens_json) return null;

  const tokens = JSON.parse(row.google_tokens_json);
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials(tokens);

  oauth2.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    db.prepare('UPDATE collaborators SET google_tokens_json = ? WHERE id = ?')
      .run(JSON.stringify(merged), collaboratorId);
  });

  return google.tasks({ version: 'v1', auth: oauth2 });
}

/**
 * Create a follow-up task after a booking
 */
export async function createFollowUpTask(collaboratorId, bookingData, calendarName) {
  const tasks = getTasksClient(collaboratorId);
  if (!tasks) return null;

  const dueDate = new Date(`${bookingData.date}T${bookingData.time}:00`);
  dueDate.setMinutes(dueDate.getMinutes() + (bookingData.duration || 30));

  try {
    // Get or create the Calendar360 task list
    let taskListId = await getOrCreateTaskList(tasks);

    const task = {
      title: `Suivi : ${bookingData.visitorName} — ${calendarName}`,
      notes: [
        `RDV du ${bookingData.date} à ${bookingData.time}`,
        bookingData.visitorEmail ? `Email : ${bookingData.visitorEmail}` : '',
        bookingData.visitorPhone ? `Tél : ${bookingData.visitorPhone}` : '',
        bookingData.notes ? `Notes : ${bookingData.notes}` : '',
        '',
        'Créé automatiquement par Calendar360',
      ].filter(Boolean).join('\n'),
      due: dueDate.toISOString(),
    };

    const res = await tasks.tasks.insert({ tasklist: taskListId, requestBody: task });
    console.log(`\x1b[35m[GOOGLE TASKS]\x1b[0m Task created: ${res.data.title}`);
    return res.data.id;
  } catch (err) {
    console.error('[GOOGLE TASKS ERROR] createFollowUpTask:', err.message);
    return null;
  }
}

/**
 * List tasks from Calendar360 task list
 */
export async function listTasks(collaboratorId) {
  const tasks = getTasksClient(collaboratorId);
  if (!tasks) return [];

  try {
    let taskListId = await getOrCreateTaskList(tasks);
    const res = await tasks.tasks.list({
      tasklist: taskListId,
      maxResults: 50,
      showCompleted: true,
      showHidden: false,
    });
    return (res.data.items || []).map(t => ({
      id: t.id,
      title: t.title,
      notes: t.notes || '',
      due: t.due || null,
      status: t.status, // 'needsAction' or 'completed'
      completed: t.completed || null,
    }));
  } catch (err) {
    console.error('[GOOGLE TASKS ERROR] listTasks:', err.message);
    return [];
  }
}

/**
 * Complete a task
 */
export async function completeTask(collaboratorId, taskId) {
  const tasks = getTasksClient(collaboratorId);
  if (!tasks) return false;

  try {
    let taskListId = await getOrCreateTaskList(tasks);
    await tasks.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: { status: 'completed' },
    });
    console.log(`\x1b[35m[GOOGLE TASKS]\x1b[0m Task completed: ${taskId}`);
    return true;
  } catch (err) {
    console.error('[GOOGLE TASKS ERROR] completeTask:', err.message);
    return false;
  }
}

/**
 * Get or create the "Calendar360" task list
 */
async function getOrCreateTaskList(tasksClient) {
  try {
    const res = await tasksClient.tasklists.list({ maxResults: 20 });
    const lists = res.data.items || [];
    const existing = lists.find(l => l.title === 'Calendar360');
    if (existing) return existing.id;

    const newList = await tasksClient.tasklists.insert({ requestBody: { title: 'Calendar360' } });
    console.log(`\x1b[35m[GOOGLE TASKS]\x1b[0m Task list "Calendar360" created`);
    return newList.data.id;
  } catch (err) {
    console.error('[GOOGLE TASKS ERROR] getOrCreateTaskList:', err.message);
    return '@default';
  }
}
