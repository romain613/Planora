import { Router } from 'express';
import { google } from 'googleapis';
import { db } from '../db/database.js';
import { requireAuth, enforceCompany } from '../middleware/auth.js';

const router = Router();

// GET /api/analytics/ga4?companyId=xxx — Fetch Google Analytics data
router.get('/ga4', requireAuth, enforceCompany, async (req, res) => {
  try {
    const companyId = req.query.companyId; // enforceCompany auto-injects from session
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const settings = db.prepare('SELECT * FROM settings WHERE companyId = ?').get(companyId);
    const propertyId = settings?.ga4_property_id;
    if (!propertyId) return res.json({ configured: false });

    const serviceAccountKey = process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountKey) return res.json({ configured: false, error: 'No service account configured' });

    let keyData;
    try { keyData = JSON.parse(serviceAccountKey); } catch { return res.json({ configured: false, error: 'Invalid service account JSON' }); }

    const auth = new google.auth.GoogleAuth({
      credentials: keyData,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });

    const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

    // Run report: page views, sessions, users for last 30 days
    const [pageViews, topPages] = await Promise.all([
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [
            { startDate: '30daysAgo', endDate: 'today' },
            { startDate: '60daysAgo', endDate: '31daysAgo' },
          ],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
          ],
        },
      }),
      analyticsData.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 10,
        },
      }),
    ]);

    // Parse overall metrics
    const current = pageViews.data.rows?.[0]?.metricValues || [];
    const previous = pageViews.data.rows?.[1]?.metricValues || [];

    const result = {
      configured: true,
      period: '30 jours',
      current: {
        pageViews: parseInt(current[0]?.value || 0),
        sessions: parseInt(current[1]?.value || 0),
        users: parseInt(current[2]?.value || 0),
        avgDuration: parseFloat(current[3]?.value || 0),
        bounceRate: parseFloat(current[4]?.value || 0),
      },
      previous: {
        pageViews: parseInt(previous[0]?.value || 0),
        sessions: parseInt(previous[1]?.value || 0),
        users: parseInt(previous[2]?.value || 0),
      },
      topPages: (topPages.data.rows || []).map(row => ({
        path: row.dimensionValues[0].value,
        views: parseInt(row.metricValues[0].value),
        sessions: parseInt(row.metricValues[1].value),
      })),
    };

    res.json(result);
  } catch (err) {
    console.error('[GA4 ERROR]', err.message);
    res.status(500).json({ configured: false, error: err.message });
  }
});

export default router;
