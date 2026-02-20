import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { Login } from './login/login';
import { SoundService } from './sound.service';

type Priority = 'low' | 'medium' | 'high';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate?: string | null;
  completedAt?: number | null;
}

type Filter = 'all' | 'active' | 'completed';

const PRIORITY_CYCLE: Priority[] = ['low', 'medium', 'high'];
const THEME_KEY = 'ng-todos-theme';
const ARCHIVE_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

@Component({
  selector: 'app-root',
  imports: [Login],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.light]': 'theme() === "light"' },
})
export class App {
  // ── Dependencies ──────────────────────────────────────────────────────────
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sound = inject(SoundService);
  readonly auth = inject(AuthService);

  // ── viewChild for edit input (Angular 17+ signal API) ────────────────────
  private readonly editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');

  // ── Toast ─────────────────────────────────────────────────────────────────
  readonly toast = signal('');
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── State ─────────────────────────────────────────────────────────────────
  readonly todos = signal<Todo[]>([]);
  readonly loading = signal(true);
  readonly newTodoText = signal('');
  readonly newTodoPriority = signal<Priority>('medium');
  readonly newTodoDueDate = signal<string>('');
  readonly newTodoOpen = signal(true);
  readonly showPriority = signal(false);
  readonly showDueDate = signal(false);
  readonly showCompleted = signal(false);
  readonly filter = signal<Filter>('all');
  readonly priorityFilter = signal<Priority | 'all'>('all');
  readonly filtersOpen = signal(false);
  readonly archiveOpen = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly editingText = signal('');
  readonly draggedId = signal<number | null>(null);
  readonly dragOverId = signal<number | null>(null);
  readonly theme = signal<'dark' | 'light'>(
    localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly overdueIds = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Set(
      this.todos()
        .filter((t) => !t.completed && !!t.dueDate)
        .filter((t) => {
          const [y, m, d] = t.dueDate!.split('-').map(Number);
          return new Date(y, m - 1, d) < today;
        })
        .map((t) => t.id)
    );
  });

  readonly archivedIds = computed(() => {
    const now = Date.now();
    return new Set(
      this.todos()
        .filter((t) => t.completed && !!t.completedAt && now - t.completedAt! > ARCHIVE_THRESHOLD_MS)
        .map((t) => t.id)
    );
  });

  readonly archivedTodos = computed(() =>
    this.todos().filter((t) => this.archivedIds().has(t.id))
  );

  readonly filteredTodos = computed(() => {
    const archived = this.archivedIds();
    const f = this.filter();
    const p = this.priorityFilter();
    const showCompleted = this.showCompleted();
    return this.todos()
      .filter((t) => {
        if (archived.has(t.id)) return false;
        if (!showCompleted && t.completed) return false;
        const statusOk = f === 'all' || (f === 'active' ? !t.completed : t.completed);
        const priorityOk = p === 'all' || t.priority === p;
        return statusOk && priorityOk;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return 0;
      });
  });

  readonly activeCount = computed(
    () => this.todos().filter((t) => !t.completed && !this.archivedIds().has(t.id)).length
  );

  readonly completedCount = computed(
    () => this.todos().filter((t) => t.completed && !this.archivedIds().has(t.id)).length
  );

  // ── Constructor ───────────────────────────────────────────────────────────
  constructor() {
    // Load todos whenever auth state changes (takeUntilDestroyed() uses
    // the injection context's DestroyRef when called in constructor)
    toObservable(this.auth.isLoggedIn)
      .pipe(
        switchMap((loggedIn) => (loggedIn ? this.http.get<Todo[]>('/api/todos') : of(null))),
        takeUntilDestroyed()
      )
      .subscribe({
        next: (todos) => {
          if (todos === null) {
            this.todos.set([]);
            this.loading.set(true);
          } else {
            this.todos.set(todos);
            this.loading.set(false);
          }
        },
        error: () => this.loading.set(false),
      });

    effect(() => {
      localStorage.setItem(THEME_KEY, this.theme());
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  logout(): void {
    this.http.post('/api/auth/logout', {}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.auth.logout();
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  showToast(msg: string): void {
    this.toast.set(msg);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.set(''), 3000);
  }

  // ── Input handlers ────────────────────────────────────────────────────────
  onNewTodoTextInput(e: Event): void {
    this.newTodoText.set((e.target as HTMLInputElement).value);
  }

  onNewTodoDueDateInput(e: Event): void {
    this.newTodoDueDate.set((e.target as HTMLInputElement).value);
  }

  onEditingTextInput(e: Event): void {
    this.editingText.set((e.target as HTMLInputElement).value);
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  isOverdue(todo: Todo): boolean {
    return this.overdueIds().has(todo.id);
  }

  formatDueDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff <= 14) return `in ${diff}d`;
    if (diff < -1 && diff >= -14) return `${-diff}d ago`;
    return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatCompletedDate(ts: number): string {
    const days = Math.floor((Date.now() - ts) / 86_400_000);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  addTodo(): void {
    const text = this.newTodoText().trim();
    if (!text) return;
    const payload = {
      text,
      completed: false,
      priority: this.newTodoPriority(),
      dueDate: this.newTodoDueDate() || null,
    };
    this.http
      .post<Todo>('/api/todos', payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (todo) => {
          this.todos.update((list) => [todo, ...list]);
          this.newTodoText.set('');
          this.newTodoDueDate.set('');
          this.sound.playAdd();
        },
        error: () => this.showToast('Failed to add task'),
      });
  }

  toggleTodo(id: number): void {
    const todo = this.todos().find((t) => t.id === id);
    if (!todo) return;
    const payload = todo.completed
      ? { completed: false, completedAt: null }
      : { completed: true, completedAt: Date.now() };
    this.todos.update((list) => list.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    this.http
      .put<Todo>(`/api/todos/${id}`, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.todos.update((list) => list.map((t) => (t.id === id ? updated : t)));
          if (updated.completed) {
            this.sound.playComplete();
          } else {
            this.sound.playUncomplete();
          }
        },
        error: () => {
          this.todos.update((list) => list.map((t) => (t.id === id ? todo : t)));
          this.showToast('Failed to update task');
        },
      });
  }

  deleteTodo(id: number): void {
    const list = this.todos();
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const todo = list[idx];
    this.todos.update((l) => l.filter((t) => t.id !== id));
    this.sound.playDelete();
    this.http
      .delete(`/api/todos/${id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {},
        error: () => {
          this.todos.update((l) => {
            const next = [...l];
            next.splice(idx, 0, todo);
            return next;
          });
          this.showToast('Failed to delete task');
        },
      });
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  setFilter(f: Filter): void {
    this.filter.set(f);
  }

  setPriorityFilter(p: Priority | 'all'): void {
    this.priorityFilter.set(p);
  }

  // ── Priority cycling ──────────────────────────────────────────────────────
  cyclePriority(id: number): void {
    const todo = this.todos().find((t) => t.id === id);
    if (!todo) return;
    const next = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(todo.priority) + 1) % PRIORITY_CYCLE.length];
    this.todos.update((list) => list.map((t) => (t.id === id ? { ...t, priority: next } : t)));
    this.http
      .put<Todo>(`/api/todos/${id}`, { priority: next })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.todos.update((list) => list.map((t) => (t.id === id ? updated : t)));
        },
        error: () => {
          this.todos.update((list) => list.map((t) => (t.id === id ? todo : t)));
          this.showToast('Failed to update priority');
        },
      });
  }

  // ── UI toggles ────────────────────────────────────────────────────────────
  toggleTheme(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  toggleNewTodo(): void {
    this.newTodoOpen.update((v) => !v);
  }

  toggleShowPriority(): void {
    this.showPriority.update((v) => !v);
  }

  toggleShowDueDate(): void {
    this.showDueDate.update((v) => !v);
  }

  toggleShowCompleted(): void {
    this.showCompleted.update((v) => !v);
  }

  toggleFilters(): void {
    this.filtersOpen.update((v) => !v);
  }

  toggleArchive(): void {
    this.archiveOpen.update((v) => !v);
  }

  // ── Inline editing ────────────────────────────────────────────────────────
  startEdit(id: number, text: string): void {
    this.editingId.set(id);
    this.editingText.set(text);
    // Wait for Angular to render the edit input, then focus it
    setTimeout(() => {
      const el = this.editInput()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }

  commitEdit(): void {
    const id = this.editingId();
    if (id === null) return;
    const text = this.editingText().trim();
    const original = this.todos().find((t) => t.id === id);
    this.editingId.set(null);
    this.editingText.set('');
    if (!text || !original) return;
    if (text === original.text) return; // nothing changed — no HTTP call needed
    this.todos.update((list) => list.map((t) => (t.id === id ? { ...t, text } : t)));
    this.sound.playEdit();
    this.http
      .put<Todo>(`/api/todos/${id}`, { text })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.todos.update((list) => list.map((t) => (t.id === id ? updated : t)));
        },
        error: () => {
          this.todos.update((list) => list.map((t) => (t.id === id ? original : t)));
          this.showToast('Failed to update task');
        },
      });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editingText.set('');
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  onDragStart(id: number, event: DragEvent): void {
    if ((event.target as HTMLElement).closest('button, label')) {
      event.preventDefault();
      return;
    }
    this.draggedId.set(id);
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(id: number, event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    if (this.dragOverId() !== id) {
      this.dragOverId.set(id);
    }
  }

  onDrop(targetId: number, event: DragEvent): void {
    event.preventDefault();
    const draggedId = this.draggedId();
    if (draggedId !== null && draggedId !== targetId) {
      this.reorderTodo(draggedId, targetId);
    }
    this.clearDrag();
  }

  onDragEnd(): void {
    this.clearDrag();
  }

  private clearDrag(): void {
    this.draggedId.set(null);
    this.dragOverId.set(null);
  }

  private reorderTodo(draggedId: number, targetId: number): void {
    const original = [...this.todos()];
    const list = [...original];
    const fromIdx = list.findIndex((t) => t.id === draggedId);
    if (fromIdx === -1) return;
    const [item] = list.splice(fromIdx, 1);
    const toIdx = list.findIndex((t) => t.id === targetId);
    if (toIdx === -1) return;
    list.splice(toIdx, 0, item);
    this.todos.set(list);
    this.http
      .patch('/api/todos/reorder', { ids: list.map((t) => t.id) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {},
        error: () => {
          this.todos.set(original);
          this.showToast('Failed to reorder tasks');
        },
      });
  }
}
