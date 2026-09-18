const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'red-apple-super-secret-2025';

// Multer setup for Media Manager (Step 2)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `upload-${Date.now()}-${Math.random().toString(36).slice(2,6)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req,file,cb)=>{
  if(file.mimetype.startsWith('image/')) cb(null,true);
  else cb(new Error('Only images allowed'));
}});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Data persistence - JSON file (can be swapped to Postgres/Mongo in production)
const DATA_FILE = path.join(__dirname, 'data', 'db.json');

function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = {
        users: [
          {
            id: 'admin-001',
            name: 'Admin',
            email: 'admin@redapple.digital',
            password: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            city: 'Islamabad',
            createdAt: new Date().toISOString()
          }
        ],
        applications: [],
        leads: [],
        modules: [
          { id: 1, title: 'Client Research', lessons: 4, category: 'research', description: 'Finding suitable businesses and digital gaps' },
          { id: 2, title: 'Client Hunting', lessons: 5, category: 'hunting', description: 'Google Maps, social media, local discovery' },
          { id: 3, title: 'Outreach Mastery', lessons: 6, category: 'outreach', description: 'First contact, WhatsApp, follow-ups' },
          { id: 4, title: 'Sales Fundamentals', lessons: 5, category: 'sales', description: 'Client needs, service presentation, packages' },
          { id: 5, title: 'Professional Skills', lessons: 4, category: 'skills', description: 'Communication, consistency, record keeping' }
        ],
        faqs: [
          { id: 1, question: 'What is the Red Apple Student Partner program?', answer: 'The Student Partner program is a training and opportunity program where students learn client-acquisition skills, find businesses that need digital services, and submit qualified leads to Red Apple Digital Agency.', category: 'general' },
          { id: 2, question: 'Do I need to know web development?', answer: 'No. You only need to find and qualify opportunities. Our team handles development, design, and delivery.', category: 'general' },
          { id: 3, question: 'Is commission guaranteed?', answer: 'Commission is only for eligible successful deals that are verified and closed by our sales team. Commission info is displayed as potential earning: e.g., Rs. 30,000 deal = Rs. 3,000 (10%). No payment gateway — manual info only.', category: 'commission' },
          { id: 4, question: 'How do I find clients?', answer: 'You will learn to use Google Maps, social media, local directories, and other discovery methods taught in the training modules.', category: 'training' },
          { id: 5, question: 'Can I track my leads?', answer: 'Yes. Your dashboard shows lead status, verification, sales progress, and commission info for every submission.', category: 'general' }
        ],
        siteContent: {
          heroTitle: 'Learn. Find Clients. Build Your Network. Earn Through Successful Deals.',
          heroDesc: 'Join Red Apple Digital Agency as a Student Partner. Learn professional client-acquisition skills, find real business opportunities, and submit qualified leads to our team.',
          whatIsTitle: 'What is the Student Partner Program?',
          whatIsDesc: 'The Student Partner program teaches students how to identify businesses that may need digital services and how to approach them professionally. You find the right opportunities, we handle the rest.',
          commissionExample: { deal: 30000, rate: 10, commission: 3000 },
          heroImage: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80&auto=format&fit=crop',
          logoText: 'RED APPLE'
        },
        settings: {
          commissionRate: 10,
          siteName: 'Red Apple Digital Agency',
          contactEmail: 'info@redapple.digital',
          contactPhone: '+92 300 1234567',
          commissionNote: 'Commission is informational only — e.g., Rs. 30,000 deal = Rs. 3,000 (10%). No payment gateway integrated. Payout is manual and informational.'
        },
        activityLogs: [],
        notifications: []
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Migration for existing DB files
    if (!data.faqs) data.faqs = [
      { id: 1, question: 'What is the Red Apple Student Partner program?', answer: 'Training + opportunity program.', category: 'general' }
    ];
    if (!data.siteContent) data.siteContent = { heroTitle: 'Learn. Find Clients.', heroDesc: '', whatIsTitle: '', whatIsDesc: '', commissionExample: { deal: 30000, rate: 10, commission: 3000 }, heroImage: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80&auto=format&fit=crop', logoText: 'RED APPLE' };
    if (!data.siteContent.heroImage) data.siteContent.heroImage = 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80&auto=format&fit=crop';
    if (!data.siteContent.logoText) data.siteContent.logoText = 'RED APPLE';
    if (!data.settings) data.settings = { commissionRate: 10, siteName: 'Red Apple Digital Agency', commissionNote: 'Commission is informational only.' };
    if (!data.modules) data.modules = [];
    if (!data.activityLogs) data.activityLogs = [];
    if (!data.notifications) data.notifications = [];
    if (!data.siteContent.heroImage) data.siteContent.heroImage = 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80&auto=format&fit=crop';
    // save migrated
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  } catch (e) {
    console.error('DB load error', e);
    return { users: [], applications: [], leads: [], modules: [], faqs: [], siteContent: {}, settings: { commissionRate: 10 }, activityLogs: [], notifications: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Helpers
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token provided' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ====== API ROUTES ======

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), users: db.users.length, leads: db.leads.length });
});

// ===== SITE CONTENT & SETTINGS (Public) =====
app.get('/api/site-content', (req, res) => {
  res.json({ siteContent: db.siteContent, settings: db.settings });
});
app.get('/api/faqs', (req, res) => {
  res.json(db.faqs);
});
app.get('/api/modules', (req, res) => {
  res.json(db.modules);
});
app.get('/api/settings', (req, res) => {
  res.json(db.settings);
});

// ===== ADMIN CMS - Site Content =====
app.put('/api/site-content', authMiddleware, adminMiddleware, (req, res) => {
  const { heroTitle, heroDesc, whatIsTitle, whatIsDesc, commissionExample, heroImage, logoText } = req.body;
  if (heroTitle !== undefined) db.siteContent.heroTitle = heroTitle;
  if (heroDesc !== undefined) db.siteContent.heroDesc = heroDesc;
  if (whatIsTitle !== undefined) db.siteContent.whatIsTitle = whatIsTitle;
  if (whatIsDesc !== undefined) db.siteContent.whatIsDesc = whatIsDesc;
  if (commissionExample !== undefined) db.siteContent.commissionExample = commissionExample;
  if (heroImage !== undefined) db.siteContent.heroImage = heroImage;
  if (logoText !== undefined) db.siteContent.logoText = logoText;
  saveDB(db);
  res.json({ success: true, siteContent: db.siteContent });
});
app.put('/api/settings', authMiddleware, adminMiddleware, (req, res) => {
  const { commissionRate, siteName, contactEmail, contactPhone, commissionNote } = req.body;
  if (commissionRate !== undefined) db.settings.commissionRate = Number(commissionRate);
  if (siteName !== undefined) db.settings.siteName = siteName;
  if (contactEmail !== undefined) db.settings.contactEmail = contactEmail;
  if (contactPhone !== undefined) db.settings.contactPhone = contactPhone;
  if (commissionNote !== undefined) db.settings.commissionNote = commissionNote;
  // also update example
  if (commissionRate !== undefined) db.siteContent.commissionExample.rate = Number(commissionRate);
  if (commissionRate !== undefined) db.siteContent.commissionExample.commission = Math.round(db.siteContent.commissionExample.deal * Number(commissionRate) / 100);
  saveDB(db);
  res.json({ success: true, settings: db.settings });
});

// ===== ADMIN CMS - Modules CRUD =====
app.post('/api/modules', authMiddleware, adminMiddleware, (req, res) => {
  const { title, lessons, category, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const mod = { id: Date.now(), title, lessons: Number(lessons)||1, category: category||'general', description: description||'' };
  db.modules.push(mod);
  saveDB(db);
  res.json({ success: true, module: mod });
});
app.put('/api/modules/:id', authMiddleware, adminMiddleware, (req, res) => {
  const mod = db.modules.find(m => String(m.id) === String(req.params.id));
  if (!mod) return res.status(404).json({ error: 'Not found' });
  const { title, lessons, category, description } = req.body;
  if (title !== undefined) mod.title = title;
  if (lessons !== undefined) mod.lessons = Number(lessons);
  if (category !== undefined) mod.category = category;
  if (description !== undefined) mod.description = description;
  saveDB(db);
  res.json({ success: true, module: mod });
});
app.delete('/api/modules/:id', authMiddleware, adminMiddleware, (req, res) => {
  const idx = db.modules.findIndex(m => String(m.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.modules.splice(idx,1);
  saveDB(db);
  res.json({ success: true });
});

// ===== ADMIN CMS - FAQs CRUD =====
app.post('/api/faqs', authMiddleware, adminMiddleware, (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
  const faq = { id: Date.now(), question, answer, category: category||'general' };
  db.faqs.push(faq);
  saveDB(db);
  res.json({ success: true, faq });
});
app.put('/api/faqs/:id', authMiddleware, adminMiddleware, (req, res) => {
  const faq = db.faqs.find(f => String(f.id) === String(req.params.id));
  if (!faq) return res.status(404).json({ error: 'Not found' });
  const { question, answer, category } = req.body;
  if (question !== undefined) faq.question = question;
  if (answer !== undefined) faq.answer = answer;
  if (category !== undefined) faq.category = category;
  saveDB(db);
  res.json({ success: true, faq });
});
app.delete('/api/faqs/:id', authMiddleware, adminMiddleware, (req, res) => {
  const idx = db.faqs.findIndex(f => String(f.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.faqs.splice(idx,1);
  saveDB(db);
  res.json({ success: true });
});

// ===== STEP 2: Media Manager, Analytics, Roles, Export =====
// Media Upload (Hero Image, Logo)
app.post('/api/admin/upload', authMiddleware, adminMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  const { type } = req.body; // hero or logo
  if (type === 'hero') db.siteContent.heroImage = url;
  saveDB(db);
  res.json({ success: true, url, filename: req.file.filename });
});
app.put('/api/admin/hero-image', authMiddleware, adminMiddleware, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  db.siteContent.heroImage = url;
  saveDB(db);
  res.json({ success: true, heroImage: url });
});

// Analytics (Step 2)
app.get('/api/analytics', authMiddleware, adminMiddleware, (req, res) => {
  // Leads by status
  const byStatus = {
    submitted: db.leads.filter(l=>l.status==='submitted').length,
    under_review: db.leads.filter(l=>l.status==='under_review').length,
    qualified: db.leads.filter(l=>l.status==='qualified').length,
    closed: db.leads.filter(l=>l.status==='closed').length,
    paid: db.leads.filter(l=>l.status==='paid').length,
    rejected: db.leads.filter(l=>l.status==='rejected').length,
  };
  // Leads by month (last 6 months)
  const months = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  for(let i=5;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const count = db.leads.filter(l=>{
      const ld = new Date(l.createdAt);
      return ld.getFullYear()===d.getFullYear() && ld.getMonth()===d.getMonth();
    }).length;
    const comm = db.leads.filter(l=>{
      const ld = new Date(l.createdAt);
      return ld.getFullYear()===d.getFullYear() && ld.getMonth()===d.getMonth();
    }).reduce((s,l)=>s+(l.commission||0),0);
    months.push({ month: monthNames[d.getMonth()], key, count, commission: comm });
  }
  // Top students by leads
  const studentStats = db.users.filter(u=>u.role==='student').map(u=>{
    const myLeads = db.leads.filter(l=>l.studentId===u.id);
    return { name: u.name, email: u.email, leads: myLeads.length, commission: myLeads.reduce((s,l)=>s+(l.commission||0),0) };
  }).sort((a,b)=>b.leads-a.leads).slice(0,5);
  res.json({ byStatus, months, studentStats, totalLeads: db.leads.length, totalUsers: db.users.filter(u=>u.role==='student').length, totalCommission: db.leads.reduce((s,l)=>s+(l.commission||0),0) });
});

// User Role Management (Step 2) + Activity Log (Step 3)
app.patch('/api/users/:id/role', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.users.find(u=>u.id===req.params.id);
  if(!user) return res.status(404).json({ error: 'User not found' });
  const { role } = req.body;
  if(!['student','admin','moderator'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if(user.id==='admin-001' && role!=='admin') return res.status(400).json({ error: 'Cannot change main owner role' });
  const old=user.role;
  user.role = role;
  saveDB(db);
  logActivity('Role Change', `${user.name} ${old} → ${role}`, req.user);
  res.json({ success: true, user: { id:user.id, name:user.name, email:user.email, role:user.role } });
});
app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const idx=db.users.findIndex(u=>u.id===req.params.id);
  if(idx===-1) return res.status(404).json({ error: 'Not found' });
  if(db.users[idx].id==='admin-001') return res.status(400).json({ error: 'Cannot delete owner' });
  // also delete their leads and applications
  const uid=db.users[idx].id;
  const email=db.users[idx].email;
  db.users.splice(idx,1);
  db.leads = db.leads.filter(l=>l.studentId!==uid);
  db.applications = db.applications.filter(a=>a.email!==email);
  saveDB(db);
  res.json({ success: true });
});

// Export CSV (Step 2)
app.get('/api/export/leads', authMiddleware, adminMiddleware, (req, res) => {
  const headers = ['Business Name','Contact','Phone','City','Need','Status','Deal','Commission','Student','Date'];
  const rows = db.leads.map(l=>[
    `"${(l.businessName||'').replace(/"/g,'""')}"`,
    `"${(l.contactName||'').replace(/"/g,'""')}"`,
    l.phone||'',
    l.city||'',
    l.need||'',
    l.status||'',
    l.dealAmount||0,
    l.commission||0,
    `"${(l.studentName||'').replace(/"/g,'""')}"`,
    new Date(l.createdAt).toLocaleDateString()
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="red-apple-leads.csv"');
  res.send(csv);
});
app.get('/api/export/users', authMiddleware, adminMiddleware, (req, res) => {
  const headers = ['Name','Email','Phone','City','Role','Leads','Commission','Joined'];
  const rows = db.users.filter(u=>u.role!=='admin').map(u=>[
    `"${(u.name||'').replace(/"/g,'""')}"`,
    u.email||'',
    u.phone||'',
    u.city||'',
    u.role||'',
    u.stats?.leads||0,
    u.stats?.commission||0,
    new Date(u.createdAt).toLocaleDateString()
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="red-apple-users.csv"');
  res.send(csv);
});

// ===== STEP 3: Activity Logs, Bulk Actions, Notifications, Profile, Advanced Filters =====
function logActivity(action, detail, user){
  const entry = { id: Date.now()+Math.random(), action, detail, user: user?.name||'System', role: user?.role||'system', time: new Date().toISOString() };
  db.activityLogs.unshift(entry);
  if(db.activityLogs.length>200) db.activityLogs.pop();
  saveDB(db);
}
app.get('/api/activity', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.activityLogs.slice(0,100));
});
// Bulk leads update
app.post('/api/leads/bulk', authMiddleware, adminMiddleware, (req, res) => {
  const { ids, status, delete: del } = req.body;
  if(!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids' });
  let count=0;
  if(del){
    const before=db.leads.length;
    db.leads=db.leads.filter(l=>!ids.includes(l.id));
    count=before-db.leads.length;
    logActivity('Bulk Delete', `Deleted ${count} leads`, req.user);
  } else if(status){
    db.leads.forEach(l=>{ if(ids.includes(l.id)){ l.status=status; l.updatedAt=new Date().toISOString(); if(status==='closed' && !l.commission && l.dealAmount){ const rate=db.settings.commissionRate||10; l.commission=Math.round(l.dealAmount*rate/100); } count++; }});
    logActivity('Bulk Update', `Updated ${count} leads to ${status}`, req.user);
    // create notifications for owners of leads
    ids.forEach(id=>{
      const lead=db.leads.find(l=>l.id===id);
      if(lead){
        db.notifications.push({ id: Date.now()+Math.random(), userId: lead.studentId, title: `Lead ${lead.businessName} ${status}`, message: `Your lead "${lead.businessName}" is now "${status}"${lead.commission?` — Commission info: Rs. ${lead.commission}`:''}`, read:false, time: new Date().toISOString() });
      }
    });
  }
  saveDB(db);
  res.json({ success:true, count });
});
// Notifications
app.get('/api/notifications', authMiddleware, (req, res) => {
  const myNotes = db.notifications.filter(n=>n.userId===req.user.id).sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,20);
  res.json(myNotes);
});
app.post('/api/notifications/read', authMiddleware, (req, res) => {
  db.notifications.forEach(n=>{ if(n.userId===req.user.id) n.read=true; });
  saveDB(db);
  res.json({ success:true });
});
// Profile update
app.put('/api/profile', authMiddleware, (req, res) => {
  const user=db.users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({ error: 'Not found' });
  const { name, phone, city } = req.body;
  if(name) user.name=name;
  if(phone) user.phone=phone;
  if(city) user.city=city;
  saveDB(db);
  logActivity('Profile Update', `${user.name} updated profile`, req.user);
  res.json({ success:true, user: { id:user.id, name:user.name, email:user.email, role:user.role, phone:user.phone, city:user.city }});
});
app.put('/api/profile/password', authMiddleware, async (req, res) => {
  const user=db.users.find(u=>u.id===req.user.id);
  const { oldPassword, newPassword } = req.body;
  if(!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing' });
  const ok=await bcrypt.compare(oldPassword, user.password);
  if(!ok) return res.status(400).json({ error: 'Old password wrong' });
  if(newPassword.length<6) return res.status(400).json({ error: 'Min 6 chars' });
  user.password=await bcrypt.hash(newPassword,10);
  saveDB(db);
  logActivity('Password Change', `${user.name} changed password`, req.user);
  res.json({ success:true });
});
// Enhanced search with pagination
app.get('/api/leads/search', authMiddleware, (req, res) => {
  const { q, status, city, need, page=1, limit=10 } = req.query;
  let leads = req.user.role==='admin' ? db.leads : db.leads.filter(l=>l.studentId===req.user.id);
  if(q) {
    const qq=q.toLowerCase();
    leads=leads.filter(l=> l.businessName.toLowerCase().includes(qq) || l.studentName.toLowerCase().includes(qq) || l.phone.includes(qq));
  }
  if(status) leads=leads.filter(l=>l.status===status);
  if(city) leads=leads.filter(l=>l.city===city);
  if(need) leads=leads.filter(l=>l.need===need);
  leads=[...leads].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const total=leads.length;
  const start=(Number(page)-1)*Number(limit);
  const paged=leads.slice(start, start+Number(limit));
  res.json({ total, page:Number(page), limit:Number(limit), leads:paged });
});

// Apply as Student Partner
app.post('/api/apply', async (req, res) => {
  const { name, email, phone, city, message } = req.body;
  if (!name || !email || !phone) return res.status(400).json({ error: 'Name, email, phone required' });

  // check duplicate
  if (db.applications.find(a => a.email === email) || db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Application already exists with this email' });
  }

  const appEntry = {
    id: generateId('app'),
    name, email, phone, city: city || '', message: message || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  db.applications.push(appEntry);
  saveDB(db);

  // auto-create user account (pending verification) - realistic flow: application -> verified -> user can login
  // For demo we create user immediately with default password = phone last 4 + 123
  const tempPass = phone.slice(-4) + '123';
  const hashed = await bcrypt.hash(tempPass, 10);
  const user = {
    id: generateId('usr'),
    name, email, password: hashed, phone, city,
    role: 'student',
    status: 'pending',
    createdAt: new Date().toISOString(),
    stats: { leads: 0, approved: 0, commission: 0 }
  };
  db.users.push(user);
  saveDB(db);

  res.json({ success: true, message: 'Application submitted successfully', tempPassword: tempPass, application: appEntry });
});

// Register (alternative)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, city } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: generateId('usr'),
    name, email, password: hashed, phone: phone || '', city: city || '',
    role: 'student',
    status: 'active',
    createdAt: new Date().toISOString(),
    stats: { leads: 0, approved: 0, commission: 0 }
  };
  db.users.push(user);
  saveDB(db);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role, city: user.city } });
});

// Get me
app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safe } = user;
  res.json(safe);
});

// Leads - Create
app.post('/api/leads', authMiddleware, (req, res) => {
  const { businessName, contactName, phone, email, city, website, need, notes } = req.body;
  if (!businessName || !phone) return res.status(400).json({ error: 'Business name and phone required' });

  const lead = {
    id: generateId('lead'),
    studentId: req.user.id,
    studentName: req.user.name,
    studentEmail: req.user.email,
    businessName, contactName: contactName || '', phone, email: email || '', city: city || '',
    website: website || '', need: need || 'No Website', notes: notes || '',
    status: 'submitted', // submitted -> under_review -> qualified -> closed -> paid
    dealAmount: 0,
    commission: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.leads.push(lead);
  saveDB(db);

  // update user stats
  const user = db.users.find(u => u.id === req.user.id);
  if (user) {
    user.stats = user.stats || { leads: 0, approved: 0, commission: 0 };
    user.stats.leads++;
    saveDB(db);
  }

  res.json({ success: true, lead });
});

// Leads - List (student sees own, admin sees all)
app.get('/api/leads', authMiddleware, (req, res) => {
  let leads;
  if (req.user.role === 'admin') {
    leads = db.leads;
  } else {
    leads = db.leads.filter(l => l.studentId === req.user.id);
  }
  // sort newest first
  leads = [...leads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(leads);
});

// Leads - Update status (admin) - with Activity Log + Notification (Step 3)
app.patch('/api/leads/:id', authMiddleware, adminMiddleware, (req, res) => {
  const lead = db.leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const oldStatus=lead.status;
  const { status, dealAmount, commission } = req.body;
  if (status) lead.status = status;
  if (dealAmount !== undefined) lead.dealAmount = Number(dealAmount);
  if (commission !== undefined) lead.commission = Number(commission);
  lead.updatedAt = new Date().toISOString();
  // auto-calculate commission based on settings.commissionRate (informational only, no payment gateway)
  const rate = db.settings?.commissionRate || 10;
  if (lead.status === 'closed' && !lead.commission && lead.dealAmount) {
    lead.commission = Math.round(lead.dealAmount * rate / 100);
  }
  if(status && status!==oldStatus){
    logActivity('Lead Status', `${lead.businessName} ${oldStatus} → ${status} by ${req.user.name}`, req.user);
    db.notifications.push({ id: Date.now()+Math.random(), userId: lead.studentId, title: `Lead ${lead.businessName} updated`, message: `Status: ${oldStatus} → ${status}${lead.commission?` | Commission info: Rs. ${lead.commission} (${rate}%)`:''}`, read:false, time: new Date().toISOString() });
  }
  if (lead.status === 'paid' || lead.status === 'closed') {
    const student = db.users.find(u => u.id === lead.studentId);
    if (student) {
      student.stats = student.stats || { leads: 0, approved: 0, commission: 0 };
      // recalc commission
      const total = db.leads.filter(l => l.studentId === student.id && (l.status === 'closed' || l.status === 'paid')).reduce((s, l) => s + (l.commission || 0), 0);
      student.stats.commission = total;
      student.stats.approved = db.leads.filter(l => l.studentId === student.id && l.status !== 'rejected').length;
      saveDB(db);
    }
  }

  saveDB(db);
  res.json({ success: true, lead });
});

// Stats - for dashboard
app.get('/api/stats', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    const totalLeads = db.leads.length;
    const pending = db.leads.filter(l => l.status === 'submitted').length;
    const qualified = db.leads.filter(l => l.status === 'qualified').length;
    const closed = db.leads.filter(l => l.status === 'closed' || l.status === 'paid').length;
    const totalCommission = db.leads.reduce((s, l) => s + (l.commission || 0), 0);
    const totalUsers = db.users.filter(u => u.role === 'student').length;
    const pendingApps = db.applications.filter(a => a.status === 'pending').length;
    res.json({ totalLeads, pending, qualified, closed, totalCommission, totalUsers, pendingApps });
  } else {
    const myLeads = db.leads.filter(l => l.studentId === req.user.id);
    const totalLeads = myLeads.length;
    const pending = myLeads.filter(l => l.status === 'submitted' || l.status === 'under_review').length;
    const qualified = myLeads.filter(l => l.status === 'qualified').length;
    const closed = myLeads.filter(l => l.status === 'closed' || l.status === 'paid').length;
    const totalCommission = myLeads.reduce((s, l) => s + (l.commission || 0), 0);
    const paidCommission = myLeads.filter(l => l.status === 'paid').reduce((s, l) => s + (l.commission || 0), 0);
    res.json({ totalLeads, pending, qualified, closed, totalCommission, paidCommission });
  }
});

// Applications - admin only
app.get('/api/applications', authMiddleware, adminMiddleware, (req, res) => {
  res.json([...db.applications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.patch('/api/applications/:id', authMiddleware, adminMiddleware, (req, res) => {
  const appEntry = db.applications.find(a => a.id === req.params.id);
  if (!appEntry) return res.status(404).json({ error: 'Not found' });
  const { status } = req.body;
  if (status) {
    appEntry.status = status;
    // also update user status
    const user = db.users.find(u => u.email === appEntry.email);
    if (user) {
      user.status = status === 'approved' ? 'active' : user.status;
    }
  }
  saveDB(db);
  res.json({ success: true, application: appEntry });
});

// Users - admin list
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const safe = db.users.map(({ password, ...u }) => u);
  res.json(safe);
});

// ====== STATIC FRONTEND ======
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA-like routing (but keep API 404)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  // if file exists in public, express.static already handled, else serve index
  const filePath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍎 Red Apple Student Partner Platform running!`);
  console.log(`→ Local: http://localhost:${PORT}`);
  console.log(`→ Admin login: admin@redapple.digital / admin123`);
  console.log(`→ Health: http://localhost:${PORT}/api/health\n`);
});
