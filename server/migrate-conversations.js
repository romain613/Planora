import dotenv from 'dotenv'; dotenv.config();
import { db } from './db/database.js';
import { getOrCreateConversation, addCallEvent } from './routes/conversations.js';

const callLogs = db.prepare('SELECT * FROM call_logs ORDER BY createdAt ASC').all();
let events = 0;

for (const cl of callLogs) {
  const clientPhone = cl.direction === 'outbound' ? cl.toNumber : cl.fromNumber;
  const businessPhone = cl.direction === 'outbound' ? cl.fromNumber : cl.toNumber;
  if (!clientPhone) { console.log('Skip (no client phone):', cl.id); continue; }

  const conv = getOrCreateConversation({
    companyId: cl.companyId, collaboratorId: cl.collaboratorId,
    clientPhone, businessPhone, contactId: cl.contactId
  });

  const existing = db.prepare('SELECT id FROM conversation_events WHERE callLogId = ?').get(cl.id);
  if (existing) { console.log('Skip (already migrated):', cl.id); continue; }

  const isMissed = cl.status === 'missed' || cl.status === 'no-answer' || cl.status === 'busy';
  const type = isMissed ? 'call_missed' : cl.direction === 'outbound' ? 'call_outbound' : 'call_inbound';

  addCallEvent({
    conversationId: conv.id, companyId: cl.companyId, collaboratorId: cl.collaboratorId,
    callLogId: cl.id, type, clientPhone, businessPhone,
    duration: cl.duration, recordingUrl: cl.recordingUrl, status: cl.status
  });
  events++;
  console.log('Migrated:', cl.id, type, clientPhone);
}

const convCount = db.prepare('SELECT COUNT(*) as c FROM conversations').get();
const evCount = db.prepare('SELECT COUNT(*) as c FROM conversation_events').get();
console.log('\nDone! Conversations:', convCount.c, 'Events:', evCount.c);
