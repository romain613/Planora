/**
 * Secure IA Phone — Automated Report Generation
 * - Daily reports: every day at 23:00
 * - Weekly reports: Monday at 07:00
 * - Monthly reports: 1st of month at 07:00
 */

import cron from 'node-cron';
import { db } from '../db/database.js';
import { generateReport } from '../services/secureIaPhone.js';

// Get all collaborators with Secure IA enabled
function getSecureIaCollabs() {
  return db.prepare(
    'SELECT c.id, c.companyId, c.name FROM collaborators c WHERE c.secure_ia_phone = 1'
  ).all();
}

// ── Daily report: 23:00 every day ──
cron.schedule('0 23 * * *', () => {
  try {
    const collabs = getSecureIaCollabs();
    if (collabs.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    let generated = 0;

    for (const c of collabs) {
      const result = generateReport(c.companyId, c.id, 'day', today);
      if (result.success) generated++;
    }

    console.log(`\x1b[35m[CRON SECURE IA]\x1b[0m Daily reports: ${generated}/${collabs.length} generated`);
  } catch (err) {
    console.error('[CRON SECURE IA DAILY ERR]', err.message);
  }
});

// ── Weekly report: Monday at 07:00 ──
cron.schedule('0 7 * * 1', () => {
  try {
    const collabs = getSecureIaCollabs();
    if (collabs.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    let generated = 0;

    for (const c of collabs) {
      const result = generateReport(c.companyId, c.id, 'week', today);
      if (result.success) generated++;
    }

    console.log(`\x1b[35m[CRON SECURE IA]\x1b[0m Weekly reports: ${generated}/${collabs.length} generated`);
  } catch (err) {
    console.error('[CRON SECURE IA WEEKLY ERR]', err.message);
  }
});

// ── Monthly report: 1st of month at 07:00 ──
cron.schedule('0 7 1 * *', () => {
  try {
    const collabs = getSecureIaCollabs();
    if (collabs.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    let generated = 0;

    for (const c of collabs) {
      const result = generateReport(c.companyId, c.id, 'month', today);
      if (result.success) generated++;
    }

    console.log(`\x1b[35m[CRON SECURE IA]\x1b[0m Monthly reports: ${generated}/${collabs.length} generated`);
  } catch (err) {
    console.error('[CRON SECURE IA MONTHLY ERR]', err.message);
  }
});

console.log('\x1b[35m[CRON]\x1b[0m Secure IA reports scheduler started (daily 23:00, weekly Mon 7:00, monthly 1st 7:00)');
