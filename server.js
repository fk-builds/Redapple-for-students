'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { sendMail } = require('./mail');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'red-apple-super-secret-2025';
const IS_VERCEL = !!process.env.VERCEL;
app.set('trust proxy', 1);

const uploadDir = IS_VERCEL ? path.join('/tmp', 'redapple-uploads') : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmail(e) { return EMAIL_RE.test(String(e || '').trim()); }
function validPhone(p) { return String(p || '').replace(/\D/g, '').length >= 10; }
function cleanText(s, max = 200) { return String(s || '').trim().slice(0, max); }

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
function signUser(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}
async function notify(userId, title, message, email) {
  db.addNotification({ userId, title, message });
  if (email) {
    sendMail({ to: email, subject: title, text: message }).catch(() => {});
  }
}

app.get('/api/health', (req, res) => {
  const h = db.health();
  res.json({ status: 'ok', db: 'json', time: new Date().toISOString(), users: h.users, leads: h.leads });
});

app.get('/api/site-content', (req, res) => {
  res.json({ siteContent: db.getSiteContent(), settings: db.getSettings() });
});
app.get('/api/faqs', (req, res) => res.json(db.getFaqs()));
app.get('/api/modules', (req, res) => res.json(db.getModules()));
app.get('/api/settings', (req, res) => res.json(db.getSettings()));
app.get('/api/leaderboard', (req, res) => res.json(db.leaderboard(10)));

app.put('/api/site-content', authMiddleware, adminMiddleware, (req, res) => {
  const { heroTitle, heroDesc, whatIsTitle, whatIsDesc, commissionExample, heroImage, logoText } = req.body;
  const patch = {};
  if (heroTitle !== undefined) patch.heroTitle = cleanText(heroTitle, 300);
  if (heroDesc !== undefined) patch.heroDesc = cleanText(heroDesc, 800);
  if (whatIsTitle !== undefined) patch.whatIsTitle = cleanText(whatIsTitle, 200);
  if (whatIsDesc !== undefined) patch.whatIsDesc = cleanText(whatIsDesc, 800);
  if (commissionExample !== undefined) patch.commissionExample = commissionExample;
  if (heroImage !== undefined) patch.heroImage = String(heroImage).slice(0, 500);
  if (logoText !== undefined) patch.logoText = cleanText(logoText, 40);
  res.json({ success: true, siteContent: db.setSiteContent(patch) });
});
app.put('/api/settings', authMiddleware, adminMiddleware, (req, res) => {
  const { commissionRate, siteName, contactEmail, contactPhone, commissionNote } = req.body;
  const patch = {};
  if (commissionRate !== undefined) {
    const n = Number(commissionRate);
    if (Number.isNaN(n) || n < 0 || n > 100) return res.status(400).json({ error: 'Rate 0-100' });
    patch.commissionRate = n;
  }
  if (siteName !== undefined) patch.siteName = cleanText(siteName, 80);
  if (contactEmail !== undefined) patch.contactEmail = cleanText(contactEmail, 120);
  if (contactPhone !== undefined) patch.contactPhone = cleanText(contactPhone, 40);
  if (commissionNote !== undefined) patch.commissionNote = cleanText(commissionNote, 400);
  res.json({ success: true, settings: db.setSettings(patch) });
});

app.post('/api/modules', authMiddleware, adminMiddleware, (req, res) => {
  const { title, lessons, category, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const mod = db.createModule({ title: cleanText(title, 80), lessons, category, description: cleanText(description, 300) });
  res.json({ success: true, module: mod });
});
app.put('/api/modules/:id', authMiddleware, adminMiddleware, (req, res) => {
  const mod = db.updateModule(req.params.id, req.body);
  if (!mod) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, module: mod });
});
app.delete('/api/modules/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.getModuleById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.deleteModule(req.params.id);
  res.json({ success: true });
});

app.get('/api/progress', authMiddleware, (req, res) => {
  res.json(db.getProgress(req.user.id));
});
app.post('/api/progress/:id', authMiddleware, (req, res) => {
  const mod = db.getModuleById(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Module not found' });
  const progress = db.completeModule(req.user.id, req.params.id);
  db.logActivity('Training', `${req.user.name} completed ${mod.title}`, req.user);
  notify(req.user.id, 'Module completed', `You completed “${mod.title}”. Certificate is ready.`, req.user.email);
  res.json({ success: true, progress, module: mod });
});
app.get('/api/certificate/:id', authMiddleware, (req, res) => {
  const mod = db.getModuleById(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Not found' });
  const prog = db.getProgress(req.user.id)[String(req.params.id)];
  if (!prog || !prog.completed) return res.status(400).json({ error: 'Complete the module first' });
  const user = db.getUserById(req.user.id);
  res.json({
    success: true,
    name: user.name,
    module: mod.title,
    date: prog.completedAt,
    printUrl: `/certificate.html?module=${encodeURIComponent(mod.title)}&name=${encodeURIComponent(user.name)}&date=${encodeURIComponent((prog.completedAt || '').slice(0, 10))}`
  });
});

app.post('/api/faqs', authMiddleware, adminMiddleware, (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
  res.json({ success: true, faq: db.createFaq({ question, answer, category }) });
});
app.put('/api/faqs/:id', authMiddleware, adminMiddleware, (req, res) => {
  const faq = db.updateFaq(req.params.id, req.body);
  if (!faq) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, faq });
});
app.delete('/api/faqs/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (!db.getFaqById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.deleteFaq(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/upload', authMiddleware, adminMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  if (req.body.type === 'hero') db.setSiteContent({ heroImage: url });
  db.addMedia({ url, filename: req.file.filename, type: req.body.type || 'image' });
  res.json({ success: true, url, filename: req.file.filename });
});
app.put('/api/admin/hero-image', authMiddleware, adminMiddleware, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  db.setSiteContent({ heroImage: url });
  res.json({ success: true, heroImage: url });
});

app.get('/api/analytics', authMiddleware, adminMiddleware, (req, res) => res.json(db.analytics()));

app.patch('/api/users/:id/role', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { role } = req.body;
  if (!['student', 'admin', 'moderator'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (user.id === 'admin-001' && role !== 'admin') return res.status(400).json({ error: 'Cannot change main owner role' });
  const updated = db.updateUser(user.id, { role });
  db.logActivity('Role Change', `${user.name} ${user.role} → ${role}`, req.user);
  res.json({ success: true, user: publicUser(updated) });
});
app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.id === 'admin-001') return res.status(400).json({ error: 'Cannot delete owner' });
  db.deleteUser(user.id);
  db.logActivity('User Delete', `Deleted ${user.name}`, req.user);
  res.json({ success: true });
});

app.get('/api/export/leads', authMiddleware, adminMiddleware, (req, res) => {
  const leads = db.getLeads({ role: 'admin' });
  const headers = ['Business Name','Contact','Phone','City','Need','Status','Score','Deal','Commission','Payout','Student','Date'];
  const rows = leads.map(l => [
    `"${(l.businessName||'').replace(/"/g,'""')}"`,
    `"${(l.contactName||'').replace(/"/g,'""')}"`,
    l.phone||'', l.city||'', l.need||'', l.status||'', l.score||0,
    l.dealAmount||0, l.commission||0, l.payoutStatus||'',
    `"${(l.studentName||'').replace(/"/g,'""')}"`,
    new Date(l.createdAt).toLocaleDateString()
  ].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="red-apple-leads.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});
app.get('/api/export/users', authMiddleware, adminMiddleware, (req, res) => {
  const headers = ['Name','Email','Phone','City','Role','Leads','Commission','Referral','Joined'];
  const rows = db.getUsers().filter(u => u.role !== 'admin').map(u => [
    `"${(u.name||'').replace(/"/g,'""')}"`, u.email||'', u.phone||'', u.city||'', u.role||'',
    u.stats?.leads||0, u.stats?.commission||0, u.referralCode||'',
    new Date(u.createdAt).toLocaleDateString()
  ].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="red-apple-users.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

app.get('/api/activity', authMiddleware, adminMiddleware, (req, res) => res.json(db.getActivity(100)));
app.delete('/api/activity', authMiddleware, adminMiddleware, (req, res) => { db.clearActivity(); res.json({ success: true }); });

app.post('/api/leads/bulk', authMiddleware, adminMiddleware, (req, res) => {
  const { ids, status, delete: del, payoutStatus } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids' });
  if (ids.length > 100) return res.status(400).json({ error: 'Max 100' });
  let count = 0;
  if (del) {
    db.deleteLeads(ids);
    count = ids.length;
    db.logActivity('Bulk Delete', `Deleted ${count} leads`, req.user);
  } else {
    const rate = db.getSettings().commissionRate || 10;
    ids.forEach(id => {
      const lead = db.getLeadById(id);
      if (!lead) return;
      const patch = {};
      if (status) {
        patch.status = status;
        if (status === 'closed' && !lead.commission && lead.dealAmount) {
          patch.commission = Math.round(lead.dealAmount * rate / 100);
        }
      }
      if (payoutStatus) patch.payoutStatus = payoutStatus;
      db.updateLead(id, patch);
      count++;
      if (status) {
        const student = db.getUserById(lead.studentId);
        notify(lead.studentId, `Lead ${lead.businessName} ${status}`,
          `Your lead “${lead.businessName}” is now “${status}”.`, student?.email);
      }
    });
    db.logActivity('Bulk Update', `Updated ${count} leads`, req.user);
  }
  res.json({ success: true, count });
});

app.get('/api/notifications', authMiddleware, (req, res) => res.json(db.getNotifications(req.user.id)));
app.post('/api/notifications/read', authMiddleware, (req, res) => {
  db.markNotificationsRead(req.user.id);
  res.json({ success: true });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const { name, phone, city } = req.body;
  const patch = {};
  if (name) patch.name = cleanText(name, 80);
  if (phone) {
    if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone' });
    patch.phone = cleanText(phone, 30);
  }
  if (city) patch.city = cleanText(city, 60);
  const user = db.updateUser(req.user.id, patch);
  db.logActivity('Profile Update', `${user.name} updated profile`, req.user);
  res.json({ success: true, user: publicUser(user) });
});
app.put('/api/profile/password', authMiddleware, async (req, res) => {
  const user = db.getUserById(req.user.id);
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing' });
  const ok = await bcrypt.compare(oldPassword, user.password);
  if (!ok) return res.status(400).json({ error: 'Old password wrong' });
  if (String(newPassword).length < 6) return res.status(400).json({ error: 'Min 6 chars' });
  db.updateUser(user.id, { password: await bcrypt.hash(newPassword, 10) });
  db.logActivity('Password Change', `${user.name} changed password`, req.user);
  res.json({ success: true });
});

app.get('/api/leads/search', authMiddleware, (req, res) => {
  const { q, status, city, need, page = 1, limit = 10 } = req.query;
  res.json(db.searchLeads({
    role: req.user.role, userId: req.user.id, q, status, city, need,
    page: Math.max(1, Number(page) || 1),
    limit: Math.min(50, Math.max(1, Number(limit) || 10))
  }));
});

app.post('/api/apply', authLimiter, async (req, res) => {
  const { name, email, phone, city, message, referralCode } = req.body;
  if (!name || !email || !phone) return res.status(400).json({ error: 'Name, email, phone required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone (min 10 digits)' });
  if (db.getApplicationByEmail(email) || db.getUserByEmail(email)) {
    return res.status(400).json({ error: 'Application already exists with this email' });
  }
  let referredBy = '';
  if (referralCode) {
    const ref = db.getUserByReferral(String(referralCode).trim().toUpperCase());
    if (ref) referredBy = ref.id;
  }
  const appEntry = db.createApplication({
    name: cleanText(name, 80), email: email.trim().toLowerCase(),
    phone: cleanText(phone, 30), city: cleanText(city, 60),
    message: cleanText(message, 500), referralCode: cleanText(referralCode, 20)
  });
  const tempPass = String(phone).replace(/\D/g, '').slice(-4) + '123';
  const user = db.createUser({
    name: appEntry.name, email: appEntry.email,
    password: await bcrypt.hash(tempPass, 10),
    phone: appEntry.phone, city: appEntry.city, role: 'student', status: 'pending',
    referredBy
  });
  db.logActivity('Application', `${user.name} applied`, { name: 'System', role: 'system' });
  notify(user.id, 'Application received', 'Your Student Partner application is under review.', user.email);
  res.json({ success: true, message: 'Application submitted successfully', tempPassword: tempPass, application: appEntry });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, password, phone, city, referralCode } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Min 6 chars' });
  if (db.getUserByEmail(email.trim().toLowerCase())) return res.status(400).json({ error: 'Email already registered' });
  let referredBy = '';
  if (referralCode) {
    const ref = db.getUserByReferral(String(referralCode).trim().toUpperCase());
    if (ref) referredBy = ref.id;
  }
  const user = db.createUser({
    name: cleanText(name, 80), email: email.trim().toLowerCase(),
    password: await bcrypt.hash(password, 10),
    phone: cleanText(phone, 30), city: cleanText(city, 60),
    role: 'student', status: 'active', referredBy
  });
  const token = signUser(user);
  res.json({ success: true, token, user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = db.getUserByEmail(String(email).trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signUser(user);
  res.json({ success: true, token, user: publicUser(user) });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

app.post('/api/leads', authMiddleware, writeLimiter, (req, res) => {
  const { businessName, contactName, phone, email, city, website, need, notes } = req.body;
  if (!businessName || !phone) return res.status(400).json({ error: 'Business name and phone required' });
  if (!validPhone(phone)) return res.status(400).json({ error: 'Invalid phone (min 10 digits)' });
  if (email && !validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  const lead = db.createLead({
    studentId: req.user.id, studentName: req.user.name, studentEmail: req.user.email,
    businessName: cleanText(businessName, 120), contactName: cleanText(contactName, 80),
    phone: cleanText(phone, 30), email: cleanText(email, 120), city: cleanText(city, 60),
    website: cleanText(website, 200), need: cleanText(need, 80) || 'No Website',
    notes: cleanText(notes, 800)
  });
  db.logActivity('New Lead', `${req.user.name} submitted ${lead.businessName} (score ${lead.score})`, req.user);
  const admins = db.getUsers().filter(u => u.role === 'admin');
  admins.forEach(a => notify(a.id, 'New lead submitted', `${req.user.name} submitted “${lead.businessName}” (score ${lead.score}).`, a.email));
  res.json({ success: true, lead });
});

app.get('/api/leads', authMiddleware, (req, res) => {
  res.json(db.getLeads({ role: req.user.role, userId: req.user.id }));
});

app.patch('/api/leads/:id', authMiddleware, adminMiddleware, (req, res) => {
  const lead = db.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const oldStatus = lead.status;
  const { status, dealAmount, commission, payoutStatus } = req.body;
  const allowedStatus = ['submitted', 'under_review', 'qualified', 'closed', 'paid', 'rejected'];
  if (status && !allowedStatus.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const patch = {};
  if (status) patch.status = status;
  if (dealAmount !== undefined) patch.dealAmount = Number(dealAmount);
  if (commission !== undefined) patch.commission = Number(commission);
  if (payoutStatus) {
    if (!['unpaid', 'processing', 'paid'].includes(payoutStatus)) return res.status(400).json({ error: 'Invalid payout' });
    patch.payoutStatus = payoutStatus;
  }
  const rate = db.getSettings().commissionRate || 10;
  const nextStatus = patch.status || lead.status;
  const nextDeal = patch.dealAmount !== undefined ? patch.dealAmount : lead.dealAmount;
  if (nextStatus === 'closed' && !(patch.commission || lead.commission) && nextDeal) {
    patch.commission = Math.round(Number(nextDeal) * rate / 100);
  }
  const updated = db.updateLead(lead.id, patch);
  const student = db.getUserById(lead.studentId);
  if (status && status !== oldStatus) {
    db.logActivity('Lead Status', `${lead.businessName} ${oldStatus} → ${status} by ${req.user.name}`, req.user);
    notify(lead.studentId, `Lead ${lead.businessName} updated`,
      `Status: ${oldStatus} → ${status}${updated.commission ? ` | Commission info: Rs. ${updated.commission} (${rate}%)` : ''}`,
      student?.email);
  }
  if (payoutStatus) {
    db.logActivity('Payout', `${lead.businessName} payout ${payoutStatus}`, req.user);
    notify(lead.studentId, 'Payout update',
      `Commission for “${lead.businessName}” is marked ${payoutStatus}.`, student?.email);
  }
  res.json({ success: true, lead: updated });
});

app.get('/api/stats', authMiddleware, (req, res) => res.json(db.statsFor(req.user)));

app.get('/api/applications', authMiddleware, adminMiddleware, (req, res) => res.json(db.getApplications()));
app.patch('/api/applications/:id', authMiddleware, adminMiddleware, (req, res) => {
  const appEntry = db.updateApplication(req.params.id, req.body);
  if (!appEntry) return res.status(404).json({ error: 'Not found' });
  if (req.body.status) {
    const user = db.getUserByEmail(appEntry.email);
    if (user) {
      db.updateUser(user.id, { status: req.body.status === 'approved' ? 'active' : user.status });
      notify(user.id, 'Application ' + req.body.status, `Your application is ${req.body.status}.`, user.email);
    }
  }
  res.json({ success: true, application: appEntry });
});

app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.getUsers().map(publicUser));
});

if (IS_VERCEL) app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
if (!IS_VERCEL && require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🍎 Red Apple Student Partner Platform running!`);
    console.log(`→ Local: http://localhost:${PORT}`);
    console.log(`→ DB: SQLite data/redapple.sqlite`);
    console.log(`→ Admin: ${process.env.ADMIN_EMAIL || 'admin@redapple.digital'}`);
    console.log(`→ Health: http://localhost:${PORT}/api/health\n`);
  });
}
