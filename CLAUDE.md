# Angular Todo App

## Tech Stack

- **Frontend**: Angular 21, standalone component, signals, `ChangeDetectionStrategy.OnPush`
- **Backend**: Node.js + Express 5 (`server/index.js`)
- **Data store**: JSON file (`server/todos.json`) — no database
- **Package manager**: npm (`packageManager: "npm@11.8.0"`)

## Commands

```bash
# Install dependencies (once)
npm install

# Terminal 1 — API server (port 3000)
npm run start:api

# Terminal 2 — Angular dev server (port 4200, auto-reload)
npm start

# Production build
npm run build

# Run tests
npm test
```

Angular dev server proxies all `/api/*` requests to `http://localhost:3000` via `proxy.conf.json`.
Both processes must be running for the app to work.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/app.ts` | All component logic — signals, computed, HTTP calls |
| `src/app/app.html` | Template — Angular 17+ control flow (`@if`, `@for`, `@empty`) |
| `src/app/app.css` | Styles — CSS custom properties for dark/light theming |
| `src/app/app.config.ts` | Angular providers (`provideHttpClient`) |
| `server/index.js` | Express REST API |
| `server/todos.json` | Persistent data (auto-created, committed as `[]`) |
| `proxy.conf.json` | Dev proxy: `/api` → `localhost:3000` |
| `angular.json` | Angular CLI config (proxy, build targets) |

## API Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/todos` | — | Return all todos |
| POST | `/api/todos` | `{ text, priority, dueDate }` | Create todo |
| PUT | `/api/todos/:id` | partial Todo fields | Update todo |
| DELETE | `/api/todos/:id` | — | Delete todo |
| PATCH | `/api/todos/reorder` | `{ ids: number[] }` | Persist drag-drop order |

## Todo Data Model

```typescript
interface Todo {
  id: number;          // Date.now() at creation
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string | null;   // ISO date: "YYYY-MM-DD"
  completedAt?: number | null; // Unix ms timestamp, set on completion
}
```

## Architecture

- **Single standalone component** (`App`) — no NgModules, no routing
- **All state**: `signal<T>()` — `readonly` members on the class
- **Derived state**: `computed()` — `filteredTodos`, `overdueIds`, `archivedIds`, `activeCount`
- **Side effects**: `effect()` — theme persistence to `localStorage`
- **HTTP**: `inject(HttpClient)` + `.pipe(takeUntilDestroyed(this.destroyRef))` on every subscription
- **OnPush** change detection — Angular re-renders only when signals change

## Conventions

- All signals are `readonly` class members
- HTTP subscriptions always use `.pipe(takeUntilDestroyed(this.destroyRef))`
- CSS custom properties (`--var`) defined in `:host` (dark theme default) and `:host.light` (overrides)
- Theme applied via `host: { '[class.light]': 'theme() === "light"' }`
- Dates stored as `"YYYY-MM-DD"` strings; parsed with `new Date(y, m-1, d)` (timezone-safe)
- `completedAt` is Unix ms (`Date.now()`); set when completing, cleared when un-completing
- Auto-archive: todos with `completedAt` older than 5 days are excluded from the main list

## Features

- Add / edit (dblclick) / delete todos
- Priority levels: Low / Medium / High (click badge to cycle)
- Due dates with relative labels: "Today", "Tomorrow", "in 3d", "2d ago"
- Overdue todos highlighted in red
- Collapsible "New Task" input section
- Collapsible filters (status + priority)
- Dark / light theme toggle (persisted in `localStorage`)
- Drag-and-drop reordering (HTML5 native API, order persisted via PATCH)
- Auto-archive: completed todos older than 5 days appear in collapsible Archive section
