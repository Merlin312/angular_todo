'use strict';

// process.env.NETLIFY is set to 'true' automatically by:
//   - Netlify build environment (production)
//   - netlify-cli when running `netlify dev` (local development)
// When running `node server/index.js` directly, NETLIFY is not set → uses fs.
const IS_NETLIFY = process.env.NETLIFY === 'true';

// ── Netlify Blobs implementation ──────────────────────────────────────────────

async function readUsersNetlify() {
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'app-data', consistency: 'strong' });
  const raw = await store.get('users', { type: 'text' });
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

async function writeUsersNetlify(users) {
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'app-data', consistency: 'strong' });
  await store.set('users', JSON.stringify(users));
}

async function readTodosNetlify(username) {
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'todos', consistency: 'strong' });
  const raw = await store.get(username, { type: 'text' });
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

async function writeTodosNetlify(username, todos) {
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'todos', consistency: 'strong' });
  await store.set(username, JSON.stringify(todos));
}

// ── Local file-system implementation ─────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');
const TODOS_DIR  = path.join(__dirname, 'todos');

function safeName(username) {
  return username.replace(/[^a-zA-Z0-9_-]/g, '');
}

async function readUsersLocal() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

async function writeUsersLocal(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

async function readTodosLocal(username) {
  const file = path.join(TODOS_DIR, `${safeName(username)}.json`);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

async function writeTodosLocal(username, todos) {
  if (!fs.existsSync(TODOS_DIR)) fs.mkdirSync(TODOS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TODOS_DIR, `${safeName(username)}.json`),
    JSON.stringify(todos, null, 2)
  );
}

// ── Export the correct implementation ────────────────────────────────────────

module.exports = IS_NETLIFY
  ? {
      readUsers:  readUsersNetlify,
      writeUsers: writeUsersNetlify,
      readTodos:  readTodosNetlify,
      writeTodos: writeTodosNetlify,
    }
  : {
      readUsers:  readUsersLocal,
      writeUsers: writeUsersLocal,
      readTodos:  readTodosLocal,
      writeTodos: writeTodosLocal,
    };
