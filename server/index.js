'use strict';

const express   = require('express');
const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const cors      = require('cors');
const { readUsers, writeUsers, readTodos, writeTodos } = require('./storage');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_TTL    = '24h';

const VALID_PRIORITIES      = ['low', 'medium', 'high'];
const DATE_REGEX            = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH       = 500;
const ALLOWED_UPDATE_FIELDS = ['text', 'completed', 'completedAt', 'priority', 'dueDate'];
const USERNAME_REGEX        = /^[a-zA-Z0-9_-]{3,32}$/;

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:5173',
  'https://todo8247.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // дозволяємо Postman / curl
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// ── JWT session helpers ───────────────────────────────────────────────────────

function createSession(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_TTL });
}

function getSession(token) {
  try {
    return jwt.verify(token, JWT_SECRET); // returns { username, iat, exp }
  } catch {
    return null;
  }
}

// ── Password helpers ─────────────────────────────────────────────────────────

async function verifyPassword(password, hash) {
  if (hash.startsWith('$2')) return bcrypt.compare(password, hash);
  // Legacy SHA-256 (no salt) — migrate on success
  return crypto.createHash('sha256').update(password).digest('hex') === hash;
}

async function upgradeHashIfLegacy(user, password) {
  if (user.passwordHash.startsWith('$2')) return; // already bcrypt
  try {
    const newHash = await bcrypt.hash(password, 12);
    const users = await readUsers();
    const idx = users.findIndex((u) => u.username === user.username);
    if (idx !== -1) {
      users[idx].passwordHash = newHash;
      await writeUsers(users);
    }
  } catch (err) {
    console.error('[upgradeHash] Failed:', err.message);
  }
}

// ── Auth middleware ──────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = getSession(header.slice(7));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.username = session.username;
  next();
}

// ── Rate limiter ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ── Public auth endpoints ────────────────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const users = await readUsers();
    const user = users.find((u) => u.username === username.trim());
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    upgradeHashIfLegacy(user, password); // fire-and-forget migration
    const token = createSession(user.username);
    res.json({ token, username: user.username });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || typeof username !== 'string' || !USERNAME_REGEX.test(username.trim())) {
    return res.status(400).json({ error: 'Username must be 3–32 characters (letters, digits, _ -)' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const clean = username.trim();
  try {
    const users = await readUsers();
    if (users.find((u) => u.username === clean)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    users.push({ username: clean, passwordHash });
    await writeUsers(users);
    const token = createSession(clean);
    res.status(201).json({ token, username: clean });
  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/logout
// JWT is stateless — the client clears the token from sessionStorage.
// No server-side session to destroy.
app.post('/api/auth/logout', (req, res) => {
  res.status(204).end();
});

// ── Protected todo endpoints ─────────────────────────────────────────────────

// GET /api/todos
app.get('/api/todos', requireAuth, async (req, res) => {
  try {
    res.json(await readTodos(req.username));
  } catch {
    res.status(500).json({ error: 'Failed to read todos' });
  }
});

// POST /api/todos
app.post('/api/todos', requireAuth, async (req, res) => {
  const { text, priority = 'medium', dueDate = null } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.trim().length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `text must be ${MAX_TEXT_LENGTH} characters or less` });
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'priority must be low, medium, or high' });
  }
  if (dueDate !== null && (typeof dueDate !== 'string' || !DATE_REGEX.test(dueDate))) {
    return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format' });
  }
  try {
    const todos = await readTodos(req.username);
    const todo = { id: Date.now(), text: text.trim(), completed: false, priority, dueDate, completedAt: null };
    todos.push(todo);
    await writeTodos(req.username, todos);
    res.status(201).json(todo);
  } catch {
    res.status(500).json({ error: 'Failed to save todo' });
  }
});

// PATCH /api/todos/reorder (must be before /:id)
app.patch('/api/todos/reorder', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'number')) {
    return res.status(400).json({ error: 'ids must be an array of numbers' });
  }
  try {
    const todos = await readTodos(req.username);
    const todoMap = new Map(todos.map((t) => [t.id, t]));
    const reordered = ids.map((id) => todoMap.get(id)).filter(Boolean);
    if (reordered.length !== todos.length) {
      return res.status(400).json({ error: 'ids do not match stored todos' });
    }
    await writeTodos(req.username, reordered);
    res.json(reordered);
  } catch {
    res.status(500).json({ error: 'Failed to reorder todos' });
  }
});

// PUT /api/todos/:id
app.put('/api/todos/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  if ('text' in req.body) {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text must be a non-empty string' });
    }
    if (text.trim().length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be ${MAX_TEXT_LENGTH} characters or less` });
    }
  }
  if ('priority' in req.body && !VALID_PRIORITIES.includes(req.body.priority)) {
    return res.status(400).json({ error: 'priority must be low, medium, or high' });
  }
  if ('dueDate' in req.body) {
    const { dueDate } = req.body;
    if (dueDate !== null && (typeof dueDate !== 'string' || !DATE_REGEX.test(dueDate))) {
      return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format or null' });
    }
  }
  try {
    const todos = await readTodos(req.username);
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Todo not found' });
    const update = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (field in req.body) update[field] = req.body[field];
    }
    todos[idx] = { ...todos[idx], ...update, id };
    await writeTodos(req.username, todos);
    res.json(todos[idx]);
  } catch {
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id
app.delete('/api/todos/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const todos = await readTodos(req.username);
    const filtered = todos.filter((t) => t.id !== id);
    if (filtered.length === todos.length) return res.status(404).json({ error: 'Todo not found' });
    await writeTodos(req.username, filtered);
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

// ── Start local dev server ───────────────────────────────────────────────────
// Only starts when this file is run directly (`node server/index.js`).
// When imported by netlify/functions/api.js, listen() is NOT called.

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
