const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const path = require("path");

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("Missing DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD or JWT_SECRET");
  process.exit(1);
}
const prod = process.env.NODE_ENV === "production";
const db = mysql.createPool({ uri: DATABASE_URL, connectionLimit: 8, charset: "utf8mb4" });
const STATUSES = ["New", "Contacted", "Interested", "Enrolled", "Rejected"];
const AUDIENCES = ["School student", "College student", "Graduate", "Working professional"];

async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await db.query(`CREATE TABLE IF NOT EXISTS applications (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, phone VARCHAR(30) NOT NULL,
    email VARCHAR(190) NULL, audience VARCHAR(40) NOT NULL, program VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'New', notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(status), INDEX(created_at))`);
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.query(
    "INSERT INTO admins (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)",
    [ADMIN_EMAIL.toLowerCase(), hash]
  );
}

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
    await db.query("INSERT INTO applications (name, phone, email, audience, program) VALUES (?,?,?,?,?)", [name, phone, email || null, audience, program]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});

/* ---------- admin auth ---------- */
const cookieOpts = { httpOnly: true, sameSite: "strict", secure: prod, maxAge: 8 * 3600 * 1000, path: "/" };
app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase(), password = String(req.body.password ?? "");
    const [rows] = await db.query("SELECT id, email, password_hash FROM admins WHERE email = ?", [email]);
    const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
    if (!ok) return res.status(401).json({ error: "Wrong email or password" });
    const token = jwt.sign({ id: rows[0].id, email: rows[0].email, role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.cookie("kt", token, cookieOpts).json({ ok: true, email: rows[0].email });
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
    let id;
    try { [{ insertId: id }] = await db.query("INSERT INTO users (name, email, password_hash) VALUES (?,?,?)", [name, email, hash]); }
    catch (e) { if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "An account with this email already exists. Try signing in." }); throw e; }
    const user = { id, name, email };
    giveUserCookie(res, user).json({ ok: true, user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase(), password = String(req.body.password ?? "");
    const [rows] = await db.query("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);
    const ok = await bcrypt.compare(password, rows[0] ? rows[0].password_hash : DUMMY_HASH);
    if (!rows[0] || !ok) return res.status(401).json({ error: "Wrong email or password" });
    giveUserCookie(res, rows[0]).json({ ok: true, user: publicUser(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.get("/api/auth/me", async (req, res) => {
  try {
    const p = verify(req.cookies.ku, "user");
    if (!p) return res.status(401).json({ error: "Not logged in" });
    const [rows] = await db.query("SELECT id, name, email FROM users WHERE id = ?", [p.id]);
    if (!rows[0]) return res.status(401).json({ error: "Not logged in" });
    res.json({ user: publicUser(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.post("/api/auth/logout", (req, res) => res.clearCookie("ku", { ...userCookie, maxAge: undefined }).json({ ok: true }));

/* ---------- admin: applications ---------- */
function filters(q) {
  const where = [], args = [];
  if (STATUSES.includes(q.status)) { where.push("status = ?"); args.push(q.status); }
  if (AUDIENCES.includes(q.audience)) { where.push("audience = ?"); args.push(q.audience); }
  const term = clean(q.q, 80);
  if (term) { where.push("(name LIKE ? OR phone LIKE ? OR email LIKE ? OR program LIKE ?)"); const l = `%${term}%`; args.push(l, l, l, l); }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", args };
}
app.get("/api/admin/applications", auth, async (req, res) => {
  if (req.demo) return res.json({ rows: demoRows(req.query), stats: demoStats(), demo: true });
  const f = filters(req.query);
  const [rows] = await db.query(`SELECT * FROM applications ${f.sql} ORDER BY created_at DESC LIMIT 1000`, f.args);
  const [stats] = await db.query("SELECT status, COUNT(*) AS n FROM applications GROUP BY status");
  res.json({ rows, stats });
});
app.patch("/api/admin/applications/:id", auth, async (req, res) => {
  if (req.demo) return res.json({ ok: true, demo: true }); // demo: pretend, save nothing
  const sets = [], args = [];
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Bad status" });
    sets.push("status = ?"); args.push(req.body.status);
  }
  if (req.body.notes !== undefined) { sets.push("notes = ?"); args.push(String(req.body.notes).slice(0, 2000)); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  await db.query(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`, [...args, Number(req.params.id)]);
  res.json({ ok: true });
});
app.delete("/api/admin/applications/:id", auth, async (req, res) => {
  if (req.demo) return res.json({ ok: true, demo: true });
  await db.query("DELETE FROM applications WHERE id = ?", [Number(req.params.id)]);
  res.json({ ok: true });
});
app.get("/api/admin/export.csv", auth, async (req, res) => {
  let rows;
  if (req.demo) rows = demoRows(req.query);
  else { const f = filters(req.query); [rows] = await db.query(`SELECT * FROM applications ${f.sql} ORDER BY created_at DESC`, f.args); }
  const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const head = ["id", "name", "phone", "email", "audience", "program", "status", "notes", "created_at"];
  const csv = [head.join(",")].concat(rows.map((r) => head.map((h) => cell(h === "created_at" ? new Date(r[h]).toISOString() : r[h])).join(","))).join("\n");
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=applications.csv" }).send("\ufeff" + csv);
});

/* ---------- static: the website and the admin page ---------- */
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use(express.static(path.join(__dirname, "public"), { index: "index.html", extensions: ["html"] }));

init().then(() => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Karka server running on port " + port));
}).catch((e) => { console.error("Startup failed:", e.message); process.exit(1); });
