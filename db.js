'use strict';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'redapple-data') : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const LEGACY_JSON = path.join(__dirname, 'data', 'db.json');

function now() { return new Date().toISOString(); }
function nid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
function referralCode() {
  return 'RA' + Math.random().toString(36).slice(2, 8).toUpperCase();
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

function emptyDb() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@redapple.digital';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  return {
    users: [{
      id: 'admin-001', name: 'Admin', email: adminEmail,
      password: bcrypt.hashSync(adminPass, 10),
      phone: '', city: 'Islamabad', role: 'admin', status: 'active',
      referralCode: 'RAOWNER', referredBy: '',
      createdAt: now(), stats: { leads: 0, approved: 0, commission: 0 }
    }],
    applications: [],
    leads: [],
    modules: DEFAULT_MODULES.map(m => ({ ...m })),
    faqs: DEFAULT_FAQS.map(f => ({ ...f })),
    siteContent: { ...DEFAULT_CONTENT },
    settings: { ...DEFAULT_SETTINGS },
    activityLogs: [],
    notifications: [],
    media: [],
    progress: []
  };
}

function normalize(data) {
  data.users = (data.users || []).map(u => ({
    stats: { leads: 0, approved: 0, commission: 0 },
    referralCode: u.referralCode || referralCode(),
    referredBy: u.referredBy || '',
    status: u.status || 'active',
    ...u,
    stats: u.stats || { leads: 0, approved: 0, commission: 0 }
  }));
  data.leads = (data.leads || []).map(l => ({
    payoutStatus: l.payoutStatus || 'unpaid',
    score: l.score || 0,
    ...l
  }));
  data.applications = data.applications || [];
  data.modules = data.modules && data.modules.length ? data.modules : DEFAULT_MODULES.map(m => ({ ...m }));
  data.faqs = data.faqs && data.faqs.length ? data.faqs : DEFAULT_FAQS.map(f => ({ ...f }));
  data.siteContent = { ...DEFAULT_CONTENT, ...(data.siteContent || {}) };
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  data.activityLogs = data.activityLogs || [];
  data.notifications = data.notifications || [];
  data.media = data.media || [];
  data.progress = data.progress || [];
  return data;
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return normalize(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    }
    if (!IS_SERVERLESS && fs.existsSync(LEGACY_JSON) && LEGACY_JSON !== DATA_FILE) {
      const data = normalize(JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8')));
      save(data);
      return data;
    }
  } catch (e) {
    console.error('DB load error', e.message);
  }
  const data = emptyDb();
  save(data);
  return data;
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let store = load();

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
  nid, now, referralCode, scoreLead,

  health() {
    return { users: store.users.length, leads: store.leads.length };
  },

  getSiteContent() { return store.siteContent; },
  setSiteContent(patch) { store.siteContent = { ...store.siteContent, ...patch }; save(store); return store.siteContent; },
  getSettings() { return store.settings; },
  setSettings(patch) {
    store.settings = { ...store.settings, ...patch };
    if (patch.commissionRate !== undefined) {
      store.siteContent.commissionExample = store.siteContent.commissionExample || { deal: 30000, rate: 10, commission: 3000 };
      store.siteContent.commissionExample.rate = Number(patch.commissionRate);
      store.siteContent.commissionExample.commission = Math.round((store.siteContent.commissionExample.deal || 30000) * Number(patch.commissionRate) / 100);
    }
    save(store);
    return store.settings;
  },

  getUsers() { return store.users.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  getUserById(id) { return store.users.find(u => u.id === id) || null; },
  getUserByEmail(email) { return store.users.find(u => u.email === email) || null; },
  getUserByReferral(code) { return store.users.find(u => u.referralCode === code) || null; },
  createUser(u) {
    const user = {
      id: u.id || nid('usr'),
      name: u.name, email: u.email, password: u.password,
      phone: u.phone || '', city: u.city || '',
      role: u.role || 'student', status: u.status || 'active',
      referralCode: u.referralCode || referralCode(),
      referredBy: u.referredBy || '',
      createdAt: u.createdAt || now(),
      stats: { leads: 0, approved: 0, commission: 0 }
    };
    store.users.push(user);
    save(store);
    return user;
  },
  updateUser(id, patch) {
    const u = this.getUserById(id);
    if (!u) return null;
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.phone !== undefined) u.phone = patch.phone;
    if (patch.city !== undefined) u.city = patch.city;
    if (patch.role !== undefined) u.role = patch.role;
    if (patch.status !== undefined) u.status = patch.status;
    if (patch.password !== undefined) u.password = patch.password;
    if (patch.stats) u.stats = { ...u.stats, ...patch.stats };
    save(store);
    return u;
  },
  deleteUser(id) {
    const u = this.getUserById(id);
    store.users = store.users.filter(x => x.id !== id);
    store.leads = store.leads.filter(l => l.studentId !== id);
    if (u) store.applications = store.applications.filter(a => a.email !== u.email);
    save(store);
  },
  recalcStudentStats(studentId) {
    const leads = store.leads.filter(l => l.studentId === studentId);
    const stats = {
      leads: leads.length,
      approved: leads.filter(l => l.status !== 'rejected').length,
      commission: leads.filter(l => l.status === 'closed' || l.status === 'paid').reduce((s, l) => s + (l.commission || 0), 0)
    };
    const u = this.getUserById(studentId);
    if (u) { u.stats = stats; save(store); }
    return stats;
  },

  getApplications() { return store.applications.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
  getApplicationById(id) { return store.applications.find(a => a.id === id) || null; },
  getApplicationByEmail(email) { return store.applications.find(a => a.email === email) || null; },
  createApplication(a) {
    const row = {
      id: a.id || nid('app'), name: a.name, email: a.email, phone: a.phone,
      city: a.city || '', message: a.message || '', status: a.status || 'pending',
      referralCode: a.referralCode || '', createdAt: a.createdAt || now()
    };
    store.applications.push(row);
    save(store);
    return row;
  },
  updateApplication(id, patch) {
    const a = this.getApplicationById(id);
    if (!a) return null;
    if (patch.status !== undefined) a.status = patch.status;
    save(store);
    return a;
  },

  getLeads({ role, userId } = {}) {
    let rows = role === 'admin' ? store.leads.slice() : store.leads.filter(l => l.studentId === userId);
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  getLeadById(id) { return store.leads.find(l => l.id === id) || null; },
  createLead(l) {
    const lead = {
      id: l.id || nid('lead'),
      studentId: l.studentId, studentName: l.studentName, studentEmail: l.studentEmail,
      businessName: l.businessName, contactName: l.contactName || '',
      phone: l.phone, email: l.email || '', city: l.city || '',
      website: l.website || '', need: l.need || '', notes: l.notes || '',
      status: l.status || 'submitted',
      dealAmount: l.dealAmount || 0, commission: l.commission || 0,
      payoutStatus: l.payoutStatus || 'unpaid',
      score: l.score != null ? l.score : scoreLead(l),
      createdAt: l.createdAt || now(), updatedAt: l.updatedAt || now()
    };
    store.leads.push(lead);
    save(store);
    this.recalcStudentStats(l.studentId);
    return lead;
  },
  updateLead(id, patch) {
    const l = this.getLeadById(id);
    if (!l) return null;
    if (patch.status !== undefined) l.status = patch.status;
    if (patch.dealAmount !== undefined) l.dealAmount = Number(patch.dealAmount) || 0;
    if (patch.commission !== undefined) l.commission = Number(patch.commission) || 0;
    if (patch.payoutStatus !== undefined) l.payoutStatus = patch.payoutStatus;
    if (patch.score !== undefined) l.score = Number(patch.score) || 0;
    l.updatedAt = now();
    save(store);
    if (l.studentId) this.recalcStudentStats(l.studentId);
    return l;
  },
  deleteLeads(ids) {
    store.leads = store.leads.filter(l => !ids.includes(l.id));
    save(store);
  },
  searchLeads({ role, userId, q, status, city, need, page = 1, limit = 10 }) {
    let leads = role === 'admin' ? store.leads.slice() : store.leads.filter(l => l.studentId === userId);
    if (q) {
      const qq = String(q).toLowerCase();
      leads = leads.filter(l => (l.businessName || '').toLowerCase().includes(qq) || (l.studentName || '').toLowerCase().includes(qq) || (l.phone || '').includes(q));
    }
    if (status) leads = leads.filter(l => l.status === status);
    if (city) leads = leads.filter(l => l.city === city);
    if (need) leads = leads.filter(l => l.need === need);
    leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = leads.length;
    const start = (Number(page) - 1) * Number(limit);
    return { total, page: Number(page), limit: Number(limit), leads: leads.slice(start, start + Number(limit)) };
  },

  getModules() { return store.modules.slice(); },
  getModuleById(id) { return store.modules.find(m => String(m.id) === String(id)) || null; },
  createModule(m) {
    const mod = { id: String(m.id || Date.now()), title: m.title, lessons: Number(m.lessons) || 1, category: m.category || 'general', description: m.description || '' };
    store.modules.push(mod);
    save(store);
    return mod;
  },
  updateModule(id, patch) {
    const m = this.getModuleById(id);
    if (!m) return null;
    if (patch.title !== undefined) m.title = patch.title;
    if (patch.lessons !== undefined) m.lessons = Number(patch.lessons);
    if (patch.category !== undefined) m.category = patch.category;
    if (patch.description !== undefined) m.description = patch.description;
    save(store);
    return m;
  },
  deleteModule(id) {
    store.modules = store.modules.filter(m => String(m.id) !== String(id));
    store.progress = store.progress.filter(p => String(p.moduleId) !== String(id));
    save(store);
  },
  getProgress(userId) {
    const map = {};
    store.progress.filter(p => p.userId === userId).forEach(p => {
      map[p.moduleId] = { completed: !!p.completed, completedAt: p.completedAt };
    });
    return map;
  },
  completeModule(userId, moduleId) {
    const existing = store.progress.find(p => p.userId === userId && String(p.moduleId) === String(moduleId));
    if (existing) { existing.completed = true; existing.completedAt = now(); }
    else store.progress.push({ userId, moduleId: String(moduleId), completed: true, completedAt: now() });
    save(store);
    return this.getProgress(userId);
  },

  getFaqs() { return store.faqs.slice(); },
  getFaqById(id) { return store.faqs.find(f => String(f.id) === String(id)) || null; },
  createFaq(f) {
    const row = { id: String(f.id || Date.now()), question: f.question, answer: f.answer, category: f.category || 'general' };
    store.faqs.push(row);
    save(store);
    return row;
  },
  updateFaq(id, patch) {
    const f = this.getFaqById(id);
    if (!f) return null;
    if (patch.question !== undefined) f.question = patch.question;
    if (patch.answer !== undefined) f.answer = patch.answer;
    if (patch.category !== undefined) f.category = patch.category;
    save(store);
    return f;
  },
  deleteFaq(id) {
    store.faqs = store.faqs.filter(f => String(f.id) !== String(id));
    save(store);
  },

  logActivity(action, detail, user) {
    store.activityLogs.unshift({
      id: nid('log'), action, detail,
      user: user?.name || 'System', role: user?.role || 'system', time: now()
    });
    store.activityLogs = store.activityLogs.slice(0, 200);
    save(store);
  },
  getActivity(limit = 100) { return store.activityLogs.slice(0, limit); },
  clearActivity() { store.activityLogs = []; save(store); },

  addNotification({ userId, title, message }) {
    store.notifications.push({ id: nid('ntf'), userId, title, message, read: false, time: now() });
    save(store);
  },
  getNotifications(userId) {
    return store.notifications.filter(n => n.userId === userId).sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 20);
  },
  markNotificationsRead(userId) {
    store.notifications.forEach(n => { if (n.userId === userId) n.read = true; });
    save(store);
  },

  addMedia({ url, filename, type }) {
    store.media.push({ id: nid('med'), url, filename, type: type || 'image', createdAt: now() });
    save(store);
  },

  analytics() {
    const leads = store.leads;
    const byStatus = { submitted: 0, under_review: 0, qualified: 0, closed: 0, paid: 0, rejected: 0 };
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
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        count: count.length,
        commission: count.reduce((s, l) => s + (l.commission || 0), 0)
      });
    }
    const students = store.users.filter(u => u.role === 'student');
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
    const students = store.users.filter(u => u.role === 'student');
    return students.map(u => {
      const my = store.leads.filter(l => l.studentId === u.id);
      const closed = my.filter(l => l.status === 'closed' || l.status === 'paid');
      const modulesCompleted = store.progress.filter(p => p.userId === u.id && p.completed).length;
      return {
        id: u.id, name: u.name, city: u.city, referralCode: u.referralCode,
        leads: my.length, closed: closed.length,
        commission: closed.reduce((s, l) => s + (l.commission || 0), 0),
        modulesCompleted
      };
    }).sort((a, b) => b.closed - a.closed || b.leads - a.leads).slice(0, limit);
  },

  statsFor(user) {
    if (user.role === 'admin') {
      const leads = store.leads;
      return {
        totalLeads: leads.length,
        pending: leads.filter(l => l.status === 'submitted').length,
        qualified: leads.filter(l => l.status === 'qualified').length,
        closed: leads.filter(l => l.status === 'closed' || l.status === 'paid').length,
        totalCommission: leads.reduce((s, l) => s + (l.commission || 0), 0),
        totalUsers: store.users.filter(u => u.role === 'student').length,
        pendingApps: store.applications.filter(a => a.status === 'pending').length
      };
    }
    const my = store.leads.filter(l => l.studentId === user.id);
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
