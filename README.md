# 🍎 Red Apple Student Partner — Full Stack Platform

Real full-stack project for **Red Apple Digital Agency** Student Partner Program.  
No more static demo — this is production-ready with backend, database, auth, dashboards.

### ✨ Features (Realistic)
- **Landing Page** — same pixel-perfect design, but with real API integration (no background lights, clean corporate look)
- **Auth System** — JWT, bcrypt, register/login, role-based (student / admin)
- **Student Application** — `POST /api/apply` → saves to DB, auto-creates account with temp password
- **Lead Submission** — students submit business leads, track status live
- **Commission Engine** — 10% auto-calculated on `closed` status, manual payout tracking
- **Student Dashboard** — stats, training modules, lead table, commission calculator
- **Admin Panel** — verify applications, update lead status, set deal amounts, view all users
- **Database** — JSON file persistence (swap to Postgres/Mongo in prod) — `data/db.json`

### 🗂️ Project Structure
```
├── server.js          # Express + JWT + bcrypt backend
├── package.json
├── data/db.json       # auto-created database
└── public/
    ├── index.html     # Landing (real API calls)
    ├── dashboard.html # Student dashboard
    └── admin.html     # Admin panel
```

### 🚀 Run Locally
```bash
npm install
npm start
# open http://localhost:3000
```

### 🔐 Demo Accounts
- **Admin:** `admin@redapple.digital` / `admin123`
- **Student:** Register via "Become a Student Partner" or "Create Account" — then login.

### 🔌 API Endpoints
```
POST   /api/apply              # student partner application
POST   /api/auth/register
POST   /api/auth/login
GET    /api/me
POST   /api/leads              # submit lead
GET    /api/leads
PATCH  /api/leads/:id          # admin update status/deal
GET    /api/stats
GET    /api/applications       # admin
PATCH  /api/applications/:id
GET    /api/users              # admin
GET    /api/modules
GET    /api/health
```

### 🌐 Deployment
- Works on any Node host (Render, Railway, VPS, cPanel Node)
- Set `JWT_SECRET` and `PORT` in env for production
- Replace JSON DB with Postgres by swapping `loadDB/saveDB`

© 2025 Red Apple Digital Agency
