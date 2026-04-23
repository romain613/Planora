import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'contacts');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.csv', '.ppt', '.pptx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé'));
  }
});

// GET /api/contact-documents/:contactId — list documents for a contact
router.get('/:contactId', requireAuth, (req, res) => {
  try {
    const companyId = req.auth?.companyId;
    // Verify contact belongs to company
    const contact = db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });
    if (!req.auth.isSupra && contact.companyId !== companyId) return res.status(403).json({ error: 'Accès interdit' });

    const docs = db.prepare('SELECT * FROM contact_documents WHERE contactId = ? ORDER BY uploadedAt DESC').all(req.params.contactId);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contact-documents/:contactId/upload — upload a file
router.post('/:contactId/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });

    const companyId = req.auth?.companyId;
    const contact = db.prepare('SELECT companyId FROM contacts WHERE id = ?').get(req.params.contactId);
    if (!contact) return res.status(404).json({ error: 'Contact non trouvé' });
    if (!req.auth.isSupra && contact.companyId !== companyId) return res.status(403).json({ error: 'Accès interdit' });

    const docId = 'doc_' + Date.now() + Math.random().toString(36).slice(2, 6);
    const doc = {
      id: docId,
      contactId: req.params.contactId,
      companyId: companyId || contact.companyId,
      filename: req.file.filename,
      originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      fileSize: req.file.size,
      mimeType: req.file.mimetype || '',
      uploadedBy: req.auth?.collaboratorId || '',
      uploadedAt: new Date().toISOString()
    };

    db.prepare(`INSERT INTO contact_documents (id, contactId, companyId, filename, originalName, fileSize, mimeType, uploadedBy, uploadedAt) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      doc.id, doc.contactId, doc.companyId, doc.filename, doc.originalName, doc.fileSize, doc.mimeType, doc.uploadedBy, doc.uploadedAt
    );

    res.json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contact-documents/download/:docId — download a file (authenticated)
router.get('/download/:docId', requireAuth, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM contact_documents WHERE id = ?').get(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const companyId = req.auth?.companyId;
    if (!req.auth.isSupra && doc.companyId !== companyId) return res.status(403).json({ error: 'Accès interdit' });

    const filePath = path.join(process.cwd(), 'uploads', 'contacts', doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur le disque' });

    const disposition = req.query.dl === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.originalName)}"`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contact-documents/:docId — delete a document
router.delete('/:docId', requireAuth, (req, res) => {
  try {
    const doc = db.prepare('SELECT * FROM contact_documents WHERE id = ?').get(req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    const companyId = req.auth?.companyId;
    if (!req.auth.isSupra && doc.companyId !== companyId) return res.status(403).json({ error: 'Accès interdit' });

    // Delete file from disk
    const filePath = path.join(process.cwd(), 'uploads', 'contacts', doc.filename);
    try { fs.unlinkSync(filePath); } catch {}

    // Delete from DB
    db.prepare('DELETE FROM contact_documents WHERE id = ?').run(req.params.docId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
