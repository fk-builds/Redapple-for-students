'use strict';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'redapple.sqlite');
const JSON_PATH = path.join(DATA_DIR, 'db.json');

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

function now() { return new Date().toISOString(); }
function nid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
function referralCode() {
  return 'RA' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT DEFAULT '',
  city TEXT DEFAULT '',
  role TEXT DEFAULT 'student',
  status TEXT DEFAULT 'active',
  referral_code TEXT UNIQUE,
  referred_by TEXT DEFAULT '',
  stats_leads INTEGER DEFAULT 0,
  stats_approved INTEGER DEFAULT 0,
  stats_commission INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  name TEXT, email TEXT, phone TEXT, city TEXT, message TEXT,
  status TEXT DEFAULT 'pending',
  referral_code TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  student_id TEXT, student_name TEXT, student_email TEXT,
  business_name TEXT, contact_name TEXT, phone TEXT, email TEXT,
  city TEXT, website TEXT, need TEXT, notes TEXT,
  status TEXT DEFAULT 'submitted',
  deal_amount INTEGER DEFAULT 0,
  commission INTEGER DEFAULT 0,
  payout_status TEXT DEFAULT 'unpaid',
  score INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  title TEXT, lessons INTEGER DEFAULT 1, category TEXT, description TEXT
);
CREATE TABLE IF NOT EXISTS module_progress (
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY (user_id, module_id)
);
CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  question TEXT, answer TEXT, category TEXT
);
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  action TEXT, detail TEXT, user_name TEXT, role TEXT, time TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT, title TEXT, message TEXT, read_flag INTEGER DEFAULT 0, time TEXT
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  url TEXT, filename TEXT, type TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_student ON leads(student_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
`);

function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, email: r.email, password: r.password,
    phone: r.phone || '', city: r.city || '', role: r.role, status: r.status,
    referralCode: r.referral_code, referredBy: r.referred_by || '',
    createdAt: r.created_at,
    stats: { leads: r.stats_leads || 0, approved: r.stats_approved || 0, commission: r.stats_commission || 0 }
  };
}
function mapLead(r) {
  if (!r) return null;
  return {
    id: r.id, studentId: r.student_id, studentName: r.student_name, studentEmail: r.student_email,
    businessName: r.business_name, contactName: r.contact_name || '', phone: r.phone || '',
    email: r.email || '', city: r.city || '', website: r.website || '', need: r.need || '',
    notes: r.notes || '', status: r.status, dealAmount: r.deal_amount || 0,
    commission: r.commission || 0, payoutStatus: r.payout_status || 'unpaid',
    score: r.score || 0, createdAt: r.created_at, updatedAt: r.updated_at
  };
}
function mapApp(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, city: r.city || '',
    message: r.message || '', status: r.status, referralCode: r.referral_code || '',
    createdAt: r.created_at
  };
}
function mapMod(r) {
  if (!r) return null;
  return { id: r.id, title: r.title, lessons: r.lessons, category: r.category, description: r.description };
}
function mapFaq(r) {
  if (!r) return null;
  return { id: r.id, question: r.question, answer: r.answer, category: r.category };
}

function getKv(k, fallback) {
  const row = sqlite.prepare('SELECT v FROM kv WHERE k=?').get(k);
  if (!row) return fallback;
  try { return JSON.parse(row.v); } catch { return fallback; }
}
function setKv(k, v) {
  sqlite.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')
    .run(k, JSON.stringify(v));
}

const DEFAULT_CONTENT = {
  heroTitle: 'Learn. Find Clients. Build Your Network. Earn Through Successful Deals.',
  heroDesc: 'Join Red Apple Digital Agency as a Student Partner. Learn professional client-acquisition skills, find real business opportunities, and submit qualified leads to our team.',
  whatIsTitle: 'What is the Student Partner Program?',
  whatIsDesc: 'The Student Partner program teaches students how to identify businesses that may need digital services and how to approach them professionally. You find the right opportunities, we handle the rest.',
  commissionExample: { deal: 30000, rate: 10, commission: 3000 },
  heroImage: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80&auto=format&fit=crop',
  logoText: 'RED APPLE'
};
const DEFAULT_SETTINGS = {
  commissionRate: 10,
  siteName: 'Red Apple Digital Agency',
  contactEmail: 'info@redapple.digital',
  contactPhone: '+92 300 1234567',
  commissionNote: 'Commission is informational only — e.g., Rs. 30,000 deal = Rs. 3,000 (10%). No payment gateway. Payout is manual.'
};
const DEFAULT_MODULES = [
  { id: '1', title: 'Client Research', lessons: 4, category: 'research', description: 'Finding suitable businesses and digital gaps' },
  { id: '2', title: 'Client Hunting', lessons: 5, category: 'hunting', description: 'Google Maps, social media, local discovery' },
  { id: '3', title: 'Outreach Mastery', lessons: 6, category: 'outreach', description: 'First contact, WhatsApp, follow-ups' },
  { id: '4', title: 'Sales Fundamentals', lessons: 5, category: 'sales', description: 'Client needs, service presentation, packages' },
  { id: '5', title: 'Professional Skills', lessons: 4, category: 'skills', description: 'Communication, consistency, record keeping' }
];
const DEFAULT_FAQS = [
  { id: '1', question: 'What is the Red Apple Student Partner program?', answer: 'The Student Partner program is a training and opportunity program where students learn client-acquisition skills, find businesses that need digital services, and submit qualified leads to Red Apple Digital Agency.', category: 'general' },
  { id: '2', question: 'Do I need to know web development?', answer: 'No. You only need to find and qualify opportunities. Our team handles development, design, and delivery.', category: 'general' },
  { id: '3', question: 'Is commission guaranteed?', answer: 'Commission is only for eligible successful deals that are verified and closed by our sales team. No payment gateway — manual info only.', category: 'commission' },
  { id: '4', question: 'How do I find clients?', answer: 'You will learn to use Google Maps, social media, local directories, and other discovery methods taught in the training modules.', category: 'training' },
  { id: '5', question: 'Can I track my leads?', answer: 'Yes. Your dashboard shows lead status, verification, sales progress, and commission info for every submission.', category: 'general' }
];

function seedIfEmpty() {
  const n = sqlite.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (n > 0) return;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@redapple.digital';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  sqlite.prepare(`INSERT INTO users(id,name,email,password,phone,city,role,status,referral_code,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    'admin-001', 'Admin', adminEmail, bcrypt.hashSync(adminPass, 10),
    '', 'Islamabad', 'admin', 'active', 'RAOWNER', now()
  );
  const insM = sqlite.prepare('INSERT INTO modules(id,title,lessons,category,description) VALUES(?,?,?,?,?)');
  DEFAULT_MODULES.forEach(m => insM.run(m.id, m.title, m.lessons, m.category, m.description));
  const insF = sqlite.prepare('INSERT INTO faqs(id,question,answer,category) VALUES(?,?,?,?)');
  DEFAULT_FAQS.forEach(f => insF.run(f.id, f.question, f.answer, f.category));
  setKv('siteContent', DEFAULT_CONTENT);
  setKv('settings', DEFAULT_SETTINGS);
}

function migrateJson() {
  if (!fs.existsSync(JSON_PATH)) return;
  const flag = getKv('_jsonMigrated', false);
  if (flag) return;
  let data;
  try { data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); } catch { return; }
  const tx = sqlite.transaction(() => {
    (data.users || []).forEach(u => {
      try {
        sqlite.prepare(`INSERT OR IGNORE INTO users(id,name,email,password,phone,city,role,status,referral_code,stats_leads,stats_approved,stats_commission,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          u.id, u.name, u.email, u.password, u.phone || '', u.city || '', u.role || 'student',
          u.status || 'active', u.referralCode || referralCode(),
          u.stats?.leads || 0, u.stats?.approved || 0, u.stats?.commission || 0,
          u.createdAt || now()
        );
      } catch {}
    });
    (data.applications || []).forEach(a => {
      try {
        sqlite.prepare(`INSERT OR IGNORE INTO applications(id,name,email,phone,city,message,status,created_at)
          VALUES(?,?,?,?,?,?,?,?)`).run(a.id, a.name, a.email, a.phone, a.city || '', a.message || '', a.status || 'pending', a.createdAt || now());
      } catch {}
    });
    (data.leads || []).forEach(l => {
      try {
        sqlite.prepare(`INSERT OR IGNORE INTO leads(id,student_id,student_name,student_email,business_name,contact_name,phone,email,city,website,need,notes,status,deal_amount,commission,payout_status,score,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          l.id, l.studentId, l.studentName, l.studentEmail, l.businessName, l.contactName || '',
          l.phone, l.email || '', l.city || '', l.website || '', l.need || '', l.notes || '',
          l.status || 'submitted', l.dealAmount || 0, l.commission || 0, l.payoutStatus || 'unpaid',
          l.score || 0, l.createdAt || now(), l.updatedAt || now()
        );
      } catch {}
    });
    if (data.siteContent) setKv('siteContent', { ...DEFAULT_CONTENT, ...data.siteContent });
    if (data.settings) setKv('settings', { ...DEFAULT_SETTINGS, ...data.settings });
    (data.activityLogs || []).forEach(e => {
      try {
        sqlite.prepare('INSERT OR IGNORE INTO activity_logs(id,action,detail,user_name,role,time) VALUES(?,?,?,?,?,?)')
          .run(String(e.id), e.action, e.detail, e.user, e.role, e.time);
      } catch {}
    });
    (data.notifications || []).forEach(n => {
      try {
        sqlite.prepare('INSERT OR IGNORE INTO notifications(id,user_id,title,message,read_flag,time) VALUES(?,?,?,?,?,?)')
          .run(String(n.id), n.userId, n.title, n.message, n.read ? 1 : 0, n.time);
      } catch {}
    });
    setKv('_jsonMigrated', true);
  });
  tx();
}

seedIfEmpty();
migrateJson();

function scoreLead({ website, need, phone, email, city, notes, contactName }) {
  let s = 10;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) s += 15;
  if (city) s += 10;
  if (email && /@/.test(email)) s += 10;
  if (contactName) s += 10;
  if (!website || /no website/i.test(need || '')) s += 20;
  else s += 8;
  if ((notes || '').length >= 20) s += 15;
  if (need && need !== 'No Website') s += 10;
  return Math.min(100, s);
}

const api = {
  nid, now, referralCode, scoreLead, sqlite,

  health() {
    return {
      users: sqlite.prepare('SELECT COUNT(*) c FROM users').get().c,
      leads: sqlite.prepare('SELECT COUNT(*) c FROM leads').get().c
    };
  },

  getSiteContent() { return getKv('siteContent', DEFAULT_CONTENT); },
  setSiteContent(patch) { const cur = { ...this.getSiteContent(), ...patch }; setKv('siteContent', cur); return cur; },
  getSettings() { return getKv('settings', DEFAULT_SETTINGS); },
  setSettings(patch) {
    const cur = { ...this.getSettings(), ...patch };
    setKv('settings', cur);
    if (patch.commissionRate !== undefined) {
      const sc = this.getSiteContent();
      sc.commissionExample = sc.commissionExample || { deal: 30000, rate: 10, commission: 3000 };
      sc.commissionExample.rate = Number(patch.commissionRate);
      sc.commissionExample.commission = Math.round((sc.commissionExample.deal || 30000) * Number(patch.commissionRate) / 100);
      setKv('siteContent', sc);
    }
    return cur;
  },

  getUsers() { return sqlite.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(mapUser); },
  getUserById(id) { return mapUser(sqlite.prepare('SELECT * FROM users WHERE id=?').get(id)); },
  getUserByEmail(email) { return mapUser(sqlite.prepare('SELECT * FROM users WHERE email=?').get(email)); },
  getUserByReferral(code) { return mapUser(sqlite.prepare('SELECT * FROM users WHERE referral_code=?').get(code)); },
  createUser(u) {
    const id = u.id || nid('usr');
    const code = u.referralCode || referralCode();
    sqlite.prepare(`INSERT INTO users(id,name,email,password,phone,city,role,status,referral_code,referred_by,stats_leads,stats_approved,stats_commission,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, u.name, u.email, u.password, u.phone || '', u.city || '', u.role || 'student',
      u.status || 'active', code, u.referredBy || '', 0, 0, 0, u.createdAt || now()
    );
    return this.getUserById(id);
  },
  updateUser(id, patch) {
    const u = this.getUserById(id);
    if (!u) return null;
    const next = {
      name: patch.name !== undefined ? patch.name : u.name,
      phone: patch.phone !== undefined ? patch.phone : u.phone,
      city: patch.city !== undefined ? patch.city : u.city,
      role: patch.role !== undefined ? patch.role : u.role,
      status: patch.status !== undefined ? patch.status : u.status,
      password: patch.password !== undefined ? patch.password : u.password,
      stats_leads: patch.stats?.leads !== undefined ? patch.stats.leads : u.stats.leads,
      stats_approved: patch.stats?.approved !== undefined ? patch.stats.approved : u.stats.approved,
      stats_commission: patch.stats?.commission !== undefined ? patch.stats.commission : u.stats.commission
    };
    sqlite.prepare(`UPDATE users SET name=?, phone=?, city=?, role=?, status=?, password=?, stats_leads=?, stats_approved=?, stats_commission=? WHERE id=?`)
      .run(next.name, next.phone, next.city, next.role, next.status, next.password, next.stats_leads, next.stats_approved, next.stats_commission, id);
    return this.getUserById(id);
  },
  deleteUser(id) {
    sqlite.prepare('DELETE FROM leads WHERE student_id=?').run(id);
    const email = (this.getUserById(id) || {}).email;
    sqlite.prepare('DELETE FROM users WHERE id=?').run(id);
    if (email) sqlite.prepare('DELETE FROM applications WHERE email=?').run(email);
  },
  recalcStudentStats(studentId) {
    const leads = sqlite.prepare('SELECT * FROM leads WHERE student_id=?').all(studentId);
    const stats = {
      leads: leads.length,
      approved: leads.filter(l => l.status !== 'rejected').length,
      commission: leads.filter(l => l.status === 'closed' || l.status === 'paid').reduce((s, l) => s + (l.commission || 0), 0)
    };
    sqlite.prepare('UPDATE users SET stats_leads=?, stats_approved=?, stats_commission=? WHERE id=?')
      .run(stats.leads, stats.approved, stats.commission, studentId);
    return stats;
  },

  getApplications() {
    return sqlite.prepare('SELECT * FROM applications ORDER BY created_at DESC').all().map(mapApp);
  },
  getApplicationById(id) { return mapApp(sqlite.prepare('SELECT * FROM applications WHERE id=?').get(id)); },
  getApplicationByEmail(email) { return mapApp(sqlite.prepare('SELECT * FROM applications WHERE email=?').get(email)); },
  createApplication(a) {
    const id = a.id || nid('app');
    sqlite.prepare(`INSERT INTO applications(id,name,email,phone,city,message,status,referral_code,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(id, a.name, a.email, a.phone, a.city || '', a.message || '', a.status || 'pending', a.referralCode || '', a.createdAt || now());
    return this.getApplicationById(id);
  },
  updateApplication(id, patch) {
    const a = this.getApplicationById(id);
    if (!a) return null;
    const status = patch.status !== undefined ? patch.status : a.status;
    sqlite.prepare('UPDATE applications SET status=? WHERE id=?').run(status, id);
    return this.getApplicationById(id);
  },

  getLeads({ role, userId } = {}) {
    const rows = role === 'admin'
      ? sqlite.prepare('SELECT * FROM leads ORDER BY created_at DESC').all()
      : sqlite.prepare('SELECT * FROM leads WHERE student_id=? ORDER BY created_at DESC').all(userId);
    return rows.map(mapLead);
  },
  getLeadById(id) { return mapLead(sqlite.prepare('SELECT * FROM leads WHERE id=?').get(id)); },
  createLead(l) {
    const id = l.id || nid('lead');
    const score = l.score != null ? l.score : scoreLead(l);
    sqlite.prepare(`INSERT INTO leads(id,student_id,student_name,student_email,business_name,contact_name,phone,email,city,website,need,notes,status,deal_amount,commission,payout_status,score,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, l.studentId, l.studentName, l.studentEmail, l.businessName, l.contactName || '',
      l.phone, l.email || '', l.city || '', l.website || '', l.need || '', l.notes || '',
      l.status || 'submitted', l.dealAmount || 0, l.commission || 0, l.payoutStatus || 'unpaid',
      score, l.createdAt || now(), l.updatedAt || now()
    );
    this.recalcStudentStats(l.studentId);
    return this.getLeadById(id);
  },
  updateLead(id, patch) {
    const l = this.getLeadById(id);
    if (!l) return null;
    const next = { ...l, ...patch, updatedAt: now() };
    sqlite.prepare(`UPDATE leads SET status=?, deal_amount=?, commission=?, payout_status=?, score=?, updated_at=? WHERE id=?`)
      .run(next.status, Number(next.dealAmount) || 0, Number(next.commission) || 0, next.payoutStatus || 'unpaid', Number(next.score) || 0, next.updatedAt, id);
    if (next.studentId) this.recalcStudentStats(next.studentId);
    return this.getLeadById(id);
  },
  deleteLeads(ids) {
    const stmt = sqlite.prepare('DELETE FROM leads WHERE id=?');
    const tx = sqlite.transaction((arr) => arr.forEach(id => stmt.run(id)));
    tx(ids);
  },
  searchLeads({ role, userId, q, status, city, need, page = 1, limit = 10 }) {
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    if (role !== 'admin') { sql += ' AND student_id=?'; params.push(userId); }
    if (q) { sql += ' AND (lower(business_name) LIKE ? OR lower(student_name) LIKE ? OR phone LIKE ?)'; const qq = `%${String(q).toLowerCase()}%`; params.push(qq, qq, `%${q}%`); }
    if (status) { sql += ' AND status=?'; params.push(status); }
    if (city) { sql += ' AND city=?'; params.push(city); }
    if (need) { sql += ' AND need=?'; params.push(need); }
    sql += ' ORDER BY created_at DESC';
    const all = sqlite.prepare(sql).all(...params).map(mapLead);
    const total = all.length;
    const start = (Number(page) - 1) * Number(limit);
    return { total, page: Number(page), limit: Number(limit), leads: all.slice(start, start + Number(limit)) };
  },

  getModules() { return sqlite.prepare('SELECT * FROM modules').all().map(mapMod); },
  getModuleById(id) { return mapMod(sqlite.prepare('SELECT * FROM modules WHERE id=?').get(String(id))); },
  createModule(m) {
    const id = String(m.id || Date.now());
    sqlite.prepare('INSERT INTO modules(id,title,lessons,category,description) VALUES(?,?,?,?,?)')
      .run(id, m.title, Number(m.lessons) || 1, m.category || 'general', m.description || '');
    return this.getModuleById(id);
  },
  updateModule(id, patch) {
    const m = this.getModuleById(id);
    if (!m) return null;
    sqlite.prepare('UPDATE modules SET title=?, lessons=?, category=?, description=? WHERE id=?')
      .run(patch.title !== undefined ? patch.title : m.title,
        patch.lessons !== undefined ? Number(patch.lessons) : m.lessons,
        patch.category !== undefined ? patch.category : m.category,
        patch.description !== undefined ? patch.description : m.description, String(id));
    return this.getModuleById(id);
  },
  deleteModule(id) {
    sqlite.prepare('DELETE FROM module_progress WHERE module_id=?').run(String(id));
    sqlite.prepare('DELETE FROM modules WHERE id=?').run(String(id));
  },
  getProgress(userId) {
    const rows = sqlite.prepare('SELECT * FROM module_progress WHERE user_id=?').all(userId);
    const map = {};
    rows.forEach(r => { map[r.module_id] = { completed: !!r.completed, completedAt: r.completed_at }; });
    return map;
  },
  completeModule(userId, moduleId) {
    sqlite.prepare(`INSERT INTO module_progress(user_id,module_id,completed,completed_at) VALUES(?,?,1,?)
      ON CONFLICT(user_id,module_id) DO UPDATE SET completed=1, completed_at=excluded.completed_at`)
      .run(userId, String(moduleId), now());
    return this.getProgress(userId);
  },

  getFaqs() { return sqlite.prepare('SELECT * FROM faqs').all().map(mapFaq); },
  getFaqById(id) { return mapFaq(sqlite.prepare('SELECT * FROM faqs WHERE id=?').get(String(id))); },
  createFaq(f) {
    const id = String(f.id || Date.now());
    sqlite.prepare('INSERT INTO faqs(id,question,answer,category) VALUES(?,?,?,?)')
      .run(id, f.question, f.answer, f.category || 'general');
    return this.getFaqById(id);
  },
  updateFaq(id, patch) {
    const f = this.getFaqById(id);
    if (!f) return null;
    sqlite.prepare('UPDATE faqs SET question=?, answer=?, category=? WHERE id=?')
      .run(patch.question !== undefined ? patch.question : f.question,
        patch.answer !== undefined ? patch.answer : f.answer,
        patch.category !== undefined ? patch.category : f.category, String(id));
    return this.getFaqById(id);
  },
  deleteFaq(id) { sqlite.prepare('DELETE FROM faqs WHERE id=?').run(String(id)); },

  logActivity(action, detail, user) {
    sqlite.prepare('INSERT INTO activity_logs(id,action,detail,user_name,role,time) VALUES(?,?,?,?,?,?)')
      .run(nid('log'), action, detail, user?.name || 'System', user?.role || 'system', now());
    const extra = sqlite.prepare('SELECT id FROM activity_logs ORDER BY time DESC LIMIT -1 OFFSET 200').all();
    extra.forEach(r => sqlite.prepare('DELETE FROM activity_logs WHERE id=?').run(r.id));
  },
  getActivity(limit = 100) {
    return sqlite.prepare('SELECT * FROM activity_logs ORDER BY time DESC LIMIT ?').all(limit).map(r => ({
      id: r.id, action: r.action, detail: r.detail, user: r.user_name, role: r.role, time: r.time
    }));
  },
  clearActivity() { sqlite.prepare('DELETE FROM activity_logs').run(); },

  addNotification({ userId, title, message }) {
    sqlite.prepare('INSERT INTO notifications(id,user_id,title,message,read_flag,time) VALUES(?,?,?,?,0,?)')
      .run(nid('ntf'), userId, title, message, now());
  },
  getNotifications(userId) {
    return sqlite.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY time DESC LIMIT 20').all(userId).map(n => ({
      id: n.id, userId: n.user_id, title: n.title, message: n.message, read: !!n.read_flag, time: n.time
    }));
  },
  markNotificationsRead(userId) {
    sqlite.prepare('UPDATE notifications SET read_flag=1 WHERE user_id=?').run(userId);
  },

  addMedia({ url, filename, type }) {
    sqlite.prepare('INSERT INTO media(id,url,filename,type,created_at) VALUES(?,?,?,?,?)')
      .run(nid('med'), url, filename, type || 'image', now());
  },

  analytics() {
    const leads = sqlite.prepare('SELECT * FROM leads').all().map(mapLead);
    const byStatus = {
      submitted: 0, under_review: 0, qualified: 0, closed: 0, paid: 0, rejected: 0
    };
    leads.forEach(l => { if (byStatus[l.status] !== undefined) byStatus[l.status]++; });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const months = [];
    const n = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      const count = leads.filter(l => {
        const ld = new Date(l.createdAt);
        return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth();
      });
      months.push({
        month: monthNames[d.getMonth()],
        key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
        count: count.length,
        commission: count.reduce((s, l) => s + (l.commission || 0), 0)
      });
    }
    const students = sqlite.prepare("SELECT * FROM users WHERE role='student'").all().map(mapUser);
    const studentStats = students.map(u => {
      const my = leads.filter(l => l.studentId === u.id);
      return { name: u.name, email: u.email, leads: my.length, commission: my.reduce((s, l) => s + (l.commission || 0), 0), closed: my.filter(l => l.status === 'closed' || l.status === 'paid').length };
    }).sort((a, b) => b.leads - a.leads).slice(0, 5);
    return {
      byStatus, months, studentStats,
      totalLeads: leads.length,
      totalUsers: students.length,
      totalCommission: leads.reduce((s, l) => s + (l.commission || 0), 0)
    };
  },

  leaderboard(limit = 10) {
    const students = sqlite.prepare("SELECT * FROM users WHERE role='student'").all().map(mapUser);
    const leads = sqlite.prepare('SELECT * FROM leads').all().map(mapLead);
    return students.map(u => {
      const my = leads.filter(l => l.studentId === u.id);
      const closed = my.filter(l => l.status === 'closed' || l.status === 'paid');
      const progress = sqlite.prepare('SELECT COUNT(*) c FROM module_progress WHERE user_id=? AND completed=1').get(u.id).c;
      return {
        id: u.id, name: u.name, city: u.city, referralCode: u.referralCode,
        leads: my.length, closed: closed.length,
        commission: closed.reduce((s, l) => s + (l.commission || 0), 0),
        modulesCompleted: progress
      };
    }).sort((a, b) => b.closed - a.closed || b.leads - a.leads).slice(0, limit);
  },

  statsFor(user) {
    if (user.role === 'admin') {
      const leads = sqlite.prepare('SELECT status, commission FROM leads').all();
      return {
        totalLeads: leads.length,
        pending: leads.filter(l => l.status === 'submitted').length,
        qualified: leads.filter(l => l.status === 'qualified').length,
        closed: leads.filter(l => l.status === 'closed' || l.status === 'paid').length,
        totalCommission: leads.reduce((s, l) => s + (l.commission || 0), 0),
        totalUsers: sqlite.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
        pendingApps: sqlite.prepare("SELECT COUNT(*) c FROM applications WHERE status='pending'").get().c
      };
    }
    const my = sqlite.prepare('SELECT status, commission FROM leads WHERE student_id=?').all(user.id);
    return {
      totalLeads: my.length,
      pending: my.filter(l => l.status === 'submitted' || l.status === 'under_review').length,
      qualified: my.filter(l => l.status === 'qualified').length,
      closed: my.filter(l => l.status === 'closed' || l.status === 'paid').length,
      totalCommission: my.reduce((s, l) => s + (l.commission || 0), 0),
      paidCommission: my.filter(l => l.status === 'paid').reduce((s, l) => s + (l.commission || 0), 0)
    };
  }
};

module.exports = api;
