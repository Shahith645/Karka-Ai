# Karka backend (Phase 2: login, sign up, admin demo)

## What is new
- `/login`: Sign in / Sign up for normal users, plus a "Try the admin demo" button.
- The demo opens `/admin` with SAMPLE data only. No real applicant is shown and nothing is saved. It lasts 1 hour.
- The real admin still signs in at `/admin` with ADMIN_EMAIL / ADMIN_PASSWORD.
- The `users` table is created automatically on first start. No new environment variables.

## Railway (database)
1. railway.com > New Project > Provision MySQL.
2. MySQL service > Variables > copy `MYSQL_PUBLIC_URL` (starts with `mysql://`). Use the PUBLIC one, because Render runs outside Railway.

## Render (server)
1. Push this folder to GitHub (`.env` is git-ignored).
2. Render > New > Web Service > pick the repo.
3. Build command: `npm install`   Start command: `npm start`
4. Environment variables:
   - DATABASE_URL = the Railway public URL
   - ADMIN_EMAIL, ADMIN_PASSWORD = your own admin login
   - JWT_SECRET = long random text: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - NODE_ENV = production
5. Deploy, then open `https://<your-service>.onrender.com/login`.

The site and the API are served from the same Render URL, so there is no CORS setup.

## Run locally (optional)
`npm install`, copy `.env.example` to `.env`, then `node --env-file=.env server.js` (set NODE_ENV=development).
