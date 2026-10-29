# Karka Academy: Website + Backend

A simple website with a login page, an application form, and an admin dashboard. It is one small Node.js app that serves both the website and the API from a single address. **There is no database to set up.**

---

## What you get

| Page | Address | What it does |
|---|---|---|
| Home page | `/` | The public website with the application form |
| Login / Sign up | `/login` | Normal users can create an account and sign in. It also has a **Try the admin demo** button |
| Admin dashboard | `/admin` | See applicants, search, filter, change status, add notes, delete, and export to CSV |

---

## How to log in

There are two different logins. Please read this part carefully.

### 1. Demo admin (for showing the project to others)
- Open `/login` and click **Try the admin demo**.
- **There is no email or password.** It is just a button.
- It shows **sample data only**. Nothing real is shown and nothing you change is saved.
- It lasts 1 hour.

### 2. Real admin (for you, the owner)
- Open `/admin` and sign in with the email and password **you choose** in the settings (`ADMIN_EMAIL` and `ADMIN_PASSWORD`, explained below).
- This shows the real applications that people submit on the website.

> Keep your real admin password private. Never put it in the code or on GitHub.

---

## Where your data is stored

This project has **no database**. Applications and user accounts are kept in memory and saved to a file called `data.json` on the server.

**Important:** on Render's free plan, the server's disk is wiped every time the service redeploys or restarts. That means saved applications and accounts can disappear. This is fine for a demo or portfolio. If you need to keep real applicant data for a long time, add a database or a paid disk later.

---

## Project structure

```
karka-backend/
├── server.js        The backend (API, login, admin logic)
├── package.json     List of packages the project needs
├── .env.example     Example of the settings you need to provide
├── .gitignore       Files that must NOT go to GitHub (.env, data.json)
├── README.md        This file
└── public/
    ├── index.html   The home page and application form
    ├── login.html   Login / sign up page
    └── admin.html   Admin dashboard
```

---

## Settings (environment variables)

The app needs these four settings. You give them to Render (or put them in a `.env` file on your own computer).

| Name | What to put | Example |
|---|---|---|
| `ADMIN_EMAIL` | The email you will use to sign in to `/admin` | `you@gmail.com` |
| `ADMIN_PASSWORD` | A long password that only you know | `MyLongPassword#2026` |
| `JWT_SECRET` | A long random text (40+ characters). It protects login cookies | see below |
| `NODE_ENV` | `production` when online, `development` on your computer | `production` |

**To make a random `JWT_SECRET`**, run this in a terminal:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the long text it prints. If you cannot run it, any random text of 40 or more characters also works.

If one of the first three settings is missing, the server stops and prints:
`Missing ADMIN_EMAIL, ADMIN_PASSWORD or JWT_SECRET`.

---

## Deploy online with Render (step by step)

You need a free GitHub account and a free Render account.

### Step 1: Put the code on GitHub
1. Create a new **empty** repository on github.com (for example `karka-backend`).
2. Open a terminal inside the `karka-backend` folder and run:
   ```
   git init
   git add .
   git commit -m "first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/karka-backend.git
   git push -u origin main
   ```
3. The `.env` and `data.json` files are ignored automatically, so your secrets are not uploaded.

### Step 2: Create the web service on Render
1. Go to **render.com** and sign in with GitHub.
2. Click **New +**, then **Web Service**.
3. Choose your `karka-backend` repository.
4. Fill in:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### Step 3: Add the settings
Scroll to **Environment Variables** and add the four settings from the table above:
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, `NODE_ENV` (set to `production`).

### Step 4: Deploy
1. Click **Create Web Service** and wait a few minutes.
2. Open the **Logs** tab. Success looks like this:
   ```
   Karka server running on port 10000
   ```
3. Open your site: `https://YOUR-SERVICE-NAME.onrender.com`

### Step 5: Check that everything works
1. Open `/login` and click **Try the admin demo**. You should see 8 sample applicants.
2. Go back to the home page and submit the application form once.
3. Open `/admin` and sign in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`. You should see the application you just submitted.

### Updating the site later
Change your files, then run `git add .`, `git commit -m "update"`, and `git push`. Render redeploys automatically. If it does not, open the service and click **Manual Deploy**, then **Deploy latest commit**.

To change the admin password, edit `ADMIN_PASSWORD` on Render's **Environment** tab and save.

---

## Run on your own computer (optional)

You need **Node.js 20 or newer** (check with `node -v`).

1. Open a terminal in the `karka-backend` folder.
2. Install the packages:
   ```
   npm install
   ```
3. Create your settings file:
   - Mac / Linux: `cp .env.example .env`
   - Windows: `copy .env.example .env`
4. Open `.env` and fill in your own `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `JWT_SECRET`. Set `NODE_ENV=development`.
5. Start the server:
   ```
   node --env-file=.env server.js
   ```
6. Open `http://localhost:3000` in your browser.

---

## Troubleshooting

| Problem | What it means and how to fix it |
|---|---|
| `Missing ADMIN_EMAIL, ADMIN_PASSWORD or JWT_SECRET` in the logs | A setting is missing or misspelled on Render. Check the **Environment** tab and fix it |
| Logs mention `DATABASE_URL` | Render is still running an **old version** of the code. Push the latest files to GitHub and redeploy |
| `Cannot find module ...` | The packages were not installed. The Build Command must be `npm install` |
| The first page takes about 50 seconds to open | The free Render plan puts the site to sleep when nobody visits. It wakes up by itself. A paid plan avoids this |
| Applications or accounts disappeared | Render restarted or redeployed and wiped the file. See "Where your data is stored" above |
| "Wrong email or password" on `/admin` | Use exactly the `ADMIN_EMAIL` and `ADMIN_PASSWORD` set on Render. The demo button is on `/login`, not `/admin` |
| "Too many requests" | Login and form attempts are limited for safety. Wait about 15 minutes and try again |

---

## For developers: API overview

**Public**
- `POST /api/apply`: submit an application (10 per hour per visitor)
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`: normal user accounts
- `POST /api/auth/demo-admin`: start the 1-hour demo session

**Admin only** (needs the admin or demo session)
- `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`
- `GET /api/admin/applications`: list, with `?status=`, `?audience=` and `?q=` filters
- `PATCH /api/admin/applications/:id`: change `status` or `notes`
- `DELETE /api/admin/applications/:id`: delete an application
- `GET /api/admin/export.csv`: download applications as CSV

**Security already included:** passwords are hashed with bcrypt, login uses HTTP-only cookies, requests are rate limited, security headers are set with Helmet, and CSV exports are protected against spreadsheet formula injection. The demo session can never read or change real data.

**Tech:** Node.js 20+, Express, plain HTML/CSS/JavaScript for the pages.
