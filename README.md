# Karka (no database)

Frontend + backend only. Data (applications and user accounts) is kept in memory and saved to a `data.json` file next to the server.

NOTE: on Render's free plan the disk is wiped when the service redeploys or restarts, so saved data can reset. That is fine for a demo.

## Logins
- Demo admin (sample data only, nothing saved): open `/login` and click "Try the admin demo". No email or password.
- Real admin: open `/admin` and sign in with the ADMIN_EMAIL / ADMIN_PASSWORD you set on Render.

## Deploy on Render
1. Push this folder to GitHub (`.env` and `data.json` are git-ignored).
2. Render > New > Web Service > pick the repo.
3. Build command: `npm install`   Start command: `npm start`
4. Environment variables: ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET (long random text), NODE_ENV=production
5. Deploy, then open `https://<your-service>.onrender.com/login`.

## Run locally
`npm install`, copy `.env.example` to `.env`, then `node --env-file=.env server.js` (set NODE_ENV=development).
