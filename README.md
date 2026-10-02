# Red Apple Student Partner — Full Stack

Production-style platform for **Red Apple Digital Agency** Student Partner Program.

## Stack
- Express + JWT + bcrypt
- **SQLite** (`data/redapple.sqlite`) — real relational DB (swap to Supabase/Postgres later)
- Single-page app in `public/index.html`
- Local image uploads in `public/uploads`

## Run
```bash
npm install
cp .env.example .env   # set JWT_SECRET
npm start
# http://localhost:3000
```

Admin: `admin@redapple.digital` / `admin123`

## What is included
- Auth, applications, leads, commissions (info-only, no payment gateway)
- Owner-only admin in sidebar
- CMS: content, training, FAQ, settings, media, analytics, roles, export
- Activity log, bulk actions, filters, pagination, notifications, profile
- SQLite DB, `.env` secrets, rate limits, validation
- Student sees only own leads
- Training progress + printable certificates
- Commission payout status (unpaid / processing / paid)
- Referral codes, leaderboard, lead scoring
- WhatsApp click-to-chat on leads
- PWA (Add to Home Screen)
- Fully responsive + official logo

## Database note
SQLite is the live database now. To move to **Supabase**:
1. Create a Supabase project
2. Put `DATABASE_URL` / `SUPABASE_URL` + service key in `.env`
3. Keep this Express API — only `db.js` needs a Postgres adapter

SMTP is optional. If unset, emails stay as in-app notifications.
