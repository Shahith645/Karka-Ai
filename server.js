const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("Missing ADMIN_EMAIL, ADMIN_PASSWORD or JWT_SECRET");
  process.exit(1);
}
const prod = process.env.NODE_ENV === "production";
const STATUSES = ["New", "Contacted", "Interested", "Enrolled", "Rejected"];
const AUDIENCES = ["School student", "College student", "Graduate", "Working professional"];

/* ---------- no database: data lives in memory and is saved to a JSON file ----------
   On Render's free plan the disk is wiped on every redeploy/restart, so data can reset. */
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
let data = { applications: [], users: [], nextApp: 1, nextUser: 1 };
try { data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }; } catch {}
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(data), () => {}), 300); };
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 12);
const ADMIN_MAIL = ADMIN_EMAIL.toLowerCase();

const app = express();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
    },
  },
}));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/* ---------- public: receive an application ---------- */
app.post("/api/apply", rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  try {
    if (clean(req.body.website, 50)) return res.json({ ok: true }); // honeypot: pretend success
    const name = clean(req.body.name, 120), phone = clean(req.body.phone, 30);
    const email = clean(req.body.email, 190), program = clean(req.body.program, 160);
    const audience = AUDIENCES.includes(req.body.audience) ? req.body.audience : "Graduate";
    if (!name || phone.replace(/\D/g, "").length < 7 || !program) return res.status(400).json({ error: "Invalid details" });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Invalid email" });
    if (data.applications.length >= 5000) return res.status(503).json({ error: "Inbox full" });
    data.applications.push({ id: data.nextApp++, name, phone, email: email || null, audience, program, status: "New", notes: null, created_at: new Date().toISOString() });
    save();
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});

/* ---------- admin auth ---------- */
const cookieOpts = { httpOnly: true, sameSite: "strict", secure: prod, maxAge: 8 * 3600 * 1000, path: "/" };
app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase(), password = String(req.body.password ?? "");
    const ok = (await bcrypt.compare(password, ADMIN_HASH)) && email === ADMIN_MAIL;
    if (!ok) return res.status(401).json({ error: "Wrong email or password" });
    const token = jwt.sign({ id: 1, email: ADMIN_MAIL, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.cookie("kt", token, cookieOpts).json({ ok: true, email: ADMIN_MAIL });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.post("/api/admin/logout", (req, res) => {
  const o = { ...cookieOpts, maxAge: undefined };
  res.clearCookie("kt", o).clearCookie("kd", o).json({ ok: true });
});

// A token only counts if it carries the right role. This stops a normal user's
// token (same secret) from being pasted into the admin cookie.
function verify(token, role) {
  try { const p = jwt.verify(token, JWT_SECRET); return p.role === role ? p : null; } catch { return null; }
}
function auth(req, res, next) {
  const a = verify(req.cookies.kt, "admin");
  if (a) { req.admin = a; return next(); }
  const d = verify(req.cookies.kd, "demo");
  if (d) { req.demo = true; req.admin = { email: "demo@karka.academy" }; return next(); }
  res.status(401).json({ error: "Not logged in" });
}
app.get("/api/admin/me", auth, (req, res) => res.json({ email: req.admin.email, demo: !!req.demo }));

/* ---------- demo admin: sample data only, nothing real, nothing saved ---------- */
const DEMO = [
  ["Aarav Kumar", "School student", "AI Foundations", "New"], ["Priya S", "College student", "Full-Stack Development", "Contacted"],
  ["Rahul M", "Graduate", "Data Analytics", "Interested"], ["Divya R", "Working professional", "AI Engineering", "Enrolled"],
  ["Karthik V", "College student", "UI/UX Design", "New"], ["Meena P", "Graduate", "Full-Stack Development", "Rejected"],
  ["Sanjay T", "School student", "AI Foundations", "Contacted"], ["Lakshmi N", "Graduate", "Data Analytics", "New"],
];
function demoRows(q) {
  let rows = DEMO.map((r, i) => ({
    id: i + 1, name: r[0], phone: "+91 90000 0000" + (i + 1), email: i % 2 ? "demo" + (i + 1) + "@example.com" : null,
    audience: r[1], program: r[2], status: r[3], notes: i === 1 ? "Asked about batch timings (sample note)" : null,
    created_at: new Date(Date.now() - i * 16 * 3600 * 1000).toISOString(),
  }));
  const term = clean(q.q, 80).toLowerCase();
  if (STATUSES.includes(q.status)) rows = rows.filter((r) => r.status === q.status);
  if (AUDIENCES.includes(q.audience)) rows = rows.filter((r) => r.audience === q.audience);
  if (term) rows = rows.filter((r) => [r.name, r.phone, r.email, r.program].some((v) => String(v || "").toLowerCase().includes(term)));
  return rows;
}
const demoStats = () => STATUSES.map((status) => ({ status, n: DEMO.filter((r) => r[3] === status).length }));
app.post("/api/auth/demo-admin", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  const token = jwt.sign({ role: "demo" }, JWT_SECRET, { expiresIn: "1h" });
  res.cookie("kd", token, { ...cookieOpts, maxAge: 3600 * 1000 }).json({ ok: true, redirect: "/admin" });
});

/* ---------- normal users: sign up / sign in ---------- */
const userCookie = { httpOnly: true, sameSite: "strict", secure: prod, maxAge: 7 * 24 * 3600 * 1000, path: "/" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
const giveUserCookie = (res, u) => res.cookie("ku", jwt.sign({ id: u.id, role: "user" }, JWT_SECRET, { expiresIn: "7d" }), userCookie);

app.post("/api/auth/signup", rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  try {
    const name = clean(req.body.name, 120), email = clean(req.body.email, 190).toLowerCase(), password = String(req.body.password ?? "");
    if (!name) return res.status(400).json({ error: "Please enter your name" });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email" });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Password must be 8 to 72 characters" });
    const hash = await bcrypt.hash(password, 12);
    if (data.users.some((u) => u.email === email)) return res.status(409).json({ error: "An account with this email already exists. Try signing in." });
    if (data.users.length >= 5000) return res.status(503).json({ error: "Sign-ups are full" });
    const user = { id: data.nextUser++, name, email };
    data.users.push({ ...user, password_hash: hash, created_at: new Date().toISOString() });
    save();
    giveUserCookie(res, user).json({ ok: true, user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase(), password = String(req.body.password ?? "");
    const rows = data.users.filter((u) => u.email === email);
    const ok = await bcrypt.compare(password, rows[0] ? rows[0].password_hash : DUMMY_HASH);
    if (!rows[0] || !ok) return res.status(401).json({ error: "Wrong email or password" });
    giveUserCookie(res, rows[0]).json({ ok: true, user: publicUser(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.get("/api/auth/me", async (req, res) => {
  try {
    const p = verify(req.cookies.ku, "user");
    if (!p) return res.status(401).json({ error: "Not logged in" });
    const rows = data.users.filter((u) => u.id === p.id);
    if (!rows[0]) return res.status(401).json({ error: "Not logged in" });
    res.json({ user: publicUser(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.post("/api/auth/logout", (req, res) => res.clearCookie("ku", { ...userCookie, maxAge: undefined }).json({ ok: true }));

/* ---------- admin: applications ---------- */
function filterRows(all, q) {
  let rows = all.slice();
  if (STATUSES.includes(q.status)) rows = rows.filter((r) => r.status === q.status);
  if (AUDIENCES.includes(q.audience)) rows = rows.filter((r) => r.audience === q.audience);
  const term = clean(q.q, 80).toLowerCase();
  if (term) rows = rows.filter((r) => [r.name, r.phone, r.email, r.program].some((v) => String(v || "").toLowerCase().includes(term)));
  return rows.sort((x, y) => y.created_at.localeCompare(x.created_at));
}
app.get("/api/admin/applications", auth, (req, res) => {
  if (req.demo) return res.json({ rows: demoRows(req.query), stats: demoStats(), demo: true });
  const stats = STATUSES.map((status) => ({ status, n: data.applications.filter((r) => r.status === status).length })).filter((x) => x.n);
  res.json({ rows: filterRows(data.applications, req.query).slice(0, 1000), stats });
});
app.patch("/api/admin/applications/:id", auth, (req, res) => {
  if (req.demo) return res.json({ ok: true, demo: true }); // demo: pretend, save nothing
  const row = data.applications.find((r) => r.id === Number(req.params.id));
  if (req.body.status === undefined && req.body.notes === undefined) return res.status(400).json({ error: "Nothing to update" });
  if (req.body.status !== undefined && !STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Bad status" });
  if (row) {
    if (req.body.status !== undefined) row.status = req.body.status;
    if (req.body.notes !== undefined) row.notes = String(req.body.notes).slice(0, 2000);
    save();
  }
  res.json({ ok: true });
});
app.delete("/api/admin/applications/:id", auth, (req, res) => {
  if (req.demo) return res.json({ ok: true, demo: true });
  data.applications = data.applications.filter((r) => r.id !== Number(req.params.id));
  save();
  res.json({ ok: true });
});
app.get("/api/admin/export.csv", auth, (req, res) => {
  const rows = req.demo ? demoRows(req.query) : filterRows(data.applications, req.query);
  const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const head = ["id", "name", "phone", "email", "audience", "program", "status", "notes", "created_at"];
  const csv = [head.join(",")].concat(rows.map((r) => head.map((h) => cell(h === "created_at" ? new Date(r[h]).toISOString() : r[h])).join(","))).join("\n");
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=applications.csv" }).send("\ufeff" + csv);
});

/* ---------- static: the website and the admin page ---------- */
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use(express.static(path.join(__dirname, "public"), { index: "index.html", extensions: ["html"] }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Karka server running on port " + port));
