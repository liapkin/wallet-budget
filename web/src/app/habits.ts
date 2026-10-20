import { Component, DestroyRef, computed, inject, resource, signal } from '@angular/core';
import type { Habit } from '../../../shared/src/types.ts';
import { streak } from '../../../shared/src/habits.ts';
import { athensDay } from '../../../shared/src/month.ts';
import { Api } from './api';
import { Icon } from './ui/icons';
import { Pip } from './ui/pip';
import { Toast } from './ui/toast';
import { configDraft, editDraft } from './ui/config-draft';

const DAYS = 30;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const hhmm = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit' });

function keyBytes(b64url: string) {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

@Component({
  selector: 'app-habits',
  imports: [Icon, Pip],
  styles: `
    .row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: 1px solid var(--border); }
    .row:last-child { border-bottom: 0; }
    .row .grow { flex: 1; min-width: 0; }
    .tick { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; padding: 0; border: 1px solid var(--border); border-radius: var(--r); background: transparent; color: var(--accent); cursor: pointer; }
    .tick[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
    .overdue { color: var(--err, #c0392b); }
    .cells { display: flex; gap: 2px; flex-wrap: wrap; margin-top: var(--sp-1); }
    .cells i { width: 0.6rem; height: 0.6rem; border-radius: 2px; background: var(--border); }
    .cells i.on { background: var(--accent); }
    .edit { display: grid; grid-template-columns: 2fr 8rem 3fr auto; gap: var(--sp-2); margin-bottom: var(--sp-2); align-items: center; }
    @media (max-width: 40rem) { .edit { grid-template-columns: 1fr 1fr; } }
  `,
  template: `
    <div class="page-head"><h1>Habits</h1></div>
    @if (draft(); as c) {
      @if (!(c.habits ?? []).length) {
        <div class="card empty"><app-pip scene="all-clear" /><strong>No habits yet</strong><span>Add one below. An optional time sets its reminder.</span></div>
      } @else {
        <section class="card">
          <h2>Today</h2>
          @for (h of today(); track h.id) {
            <div class="row">
              <button class="tick" type="button" [attr.aria-pressed]="isDone(h.id, day)" [attr.aria-label]="h.name" (click)="toggle(h.id, day)">
                @if (isDone(h.id, day)) { <app-icon name="check" /> }
              </button>
              <div class="grow">
                <strong>{{ h.name }}</strong>
                @if (h.time) { <span class="muted" [class.overdue]="overdue(h)"> {{ h.time }}{{ overdue(h) ? ' overdue' : '' }}</span> }
                @if (h.note) { <div class="muted">{{ h.note }}</div> }
              </div>
            </div>
          }
        </section>
        <section class="card">
          <h2>Last {{ days }} days</h2>
          @for (h of today(); track h.id) {
            <div class="row">
              <div class="grow">
                <strong>{{ h.name }}</strong>
                <div class="cells" role="img" [attr.aria-label]="h.name + ' history'">
                  @for (d of grid; track d) { <i [class.on]="isDone(h.id, d)" [title]="d"></i> }
                </div>
              </div>
              <span class="muted">Streak {{ streakOf(h.id) }}</span>
            </div>
          }
        </section>
      }

      <section class="card">
        <h2>Edit habits</h2>
        @for (h of c.habits ?? []; track h.id; let i = $index) {
          <div class="edit">
            <input [attr.aria-label]="'Habit name ' + (i + 1)" placeholder="Name" [value]="h.name" (input)="set(i, 'name', val($event))" />
            <input type="time" [attr.aria-label]="'Habit time ' + (i + 1)" [value]="h.time ?? ''" (input)="set(i, 'time', val($event))" />
            <input [attr.aria-label]="'Habit note ' + (i + 1)" placeholder="Note" [value]="h.note ?? ''" (input)="set(i, 'note', val($event))" />
            <button class="ghost" type="button" [attr.aria-label]="'Remove ' + h.name" (click)="remove(i)"><app-icon name="trash" /></button>
          </div>
        }
        <button class="ghost" type="button" (click)="add()"><app-icon name="plus" /> Add habit</button>
      </section>

      @if (canPush && key.value()?.key; as k) {
        <section class="card">
          <h2>Notifications</h2>
          @if (perm() === 'denied') {
            <p class="muted">Notifications are blocked in this browser. Allow them in the site settings to get reminders.</p>
          } @else if (subscribed()) {
            <button class="ghost" type="button" (click)="disable()" [disabled]="busy()">Disable notifications</button>
          } @else {
            <button class="primary" type="button" (click)="enable(k)" [disabled]="busy()">Enable notifications</button>
          }
        </section>
      }

      @if (dirty()) {
        <div class="savebar" role="status">
          <span class="muted grow">Unsaved changes</span>
          <button class="ghost" (click)="discard()" [disabled]="saving()">Discard</button>
          <button class="primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      }
    } @else if (failed()) {
      <p class="err">Failed to load config.</p>
    } @else {
      <span class="skeleton" style="height:12rem"></span>
    }
  `,
})
export class HabitsComponent {
  private api = inject(Api);
  private toast = inject(Toast);
  private cd = configDraft('Habits saved');
  protected draft = this.cd.draft;
  protected failed = this.cd.failed;
  protected saving = this.cd.saving;
  protected dirty = this.cd.dirty;
  protected discard = this.cd.discard;
  protected save = this.cd.save;

  protected days = DAYS;
  protected day = athensDay();
  protected grid = Array.from({ length: DAYS }, (_, i) => addDays(this.day, i - DAYS + 1));
  private now = signal(hhmm());
  /** "habit|day" keys; edited optimistically on toggle. */
  protected done = signal(new Set<string>());
  protected key = resource({ loader: () => this.api.pushKey() });
  protected canPush = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  protected perm = signal<NotificationPermission>(this.canPush ? Notification.permission : 'default');
  protected subscribed = signal(false);
  protected busy = signal(false);

  protected today = computed(() =>
    [...(this.draft()?.habits ?? [])].filter((h) => h.name).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.name.localeCompare(b.name)),
  );

  constructor() {
    const t = setInterval(() => this.now.set(hhmm()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
    this.api.habitLog(this.grid[0], this.day).then(
      (rows) => this.done.set(new Set(rows.map((r) => `${r.habit}|${r.day}`))),
      () => this.toast.show('Failed to load habit log', 'err'),
    );
    if (this.canPush) {
      navigator.serviceWorker.getRegistration('/sw.js').then((r) => r?.pushManager.getSubscription()).then((s) => this.subscribed.set(!!s), () => {});
    }
  }

  protected isDone = (habit: string, day: string) => this.done().has(`${habit}|${day}`);
  protected overdue = (h: Habit) => !!h.time && h.time <= this.now() && !this.isDone(h.id, this.day);
  protected streakOf = (habit: string) => streak(this.grid.filter((d) => this.isDone(habit, d)), this.day);
  protected val = (e: Event) => (e.target as HTMLInputElement).value;

  private mark(habit: string, day: string, on: boolean) {
    this.done.update((s) => {
      const n = new Set(s);
      on ? n.add(`${habit}|${day}`) : n.delete(`${habit}|${day}`);
      return n;
    });
  }

  protected async toggle(habit: string, day: string) {
    const on = !this.isDone(habit, day);
    this.mark(habit, day, on);
    try {
      await this.api.setHabit(day, habit, on);
    } catch {
      this.mark(habit, day, !on);
      this.toast.show('Failed to update habit', 'err');
    }
  }

  protected set(i: number, f: 'name' | 'time' | 'note', v: string) {
    editDraft(this.draft, (c) => {
      const h = c.habits![i];
      if (v) h[f] = v;
      else if (f === 'name') h.name = '';
      else delete h[f];
    });
  }

  protected add() {
    editDraft(this.draft, (c) => (c.habits ??= []).push({ id: crypto.randomUUID().slice(0, 8), name: '' }));
  }

  protected remove(i: number) {
    editDraft(this.draft, (c) => c.habits!.splice(i, 1));
  }

  protected async enable(key: string) {
    this.busy.set(true);
    try {
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      this.perm.set(await Notification.requestPermission());
      if (this.perm() !== 'granted') return;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await this.api.pushSubscribe(sub.toJSON());
      this.subscribed.set(true);
    } catch {
      this.toast.show('Could not enable notifications', 'err');
    } finally {
      this.busy.set(false);
    }
  }

  protected async disable() {
    this.busy.set(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration('/sw.js'))?.pushManager.getSubscription();
      if (sub) {
        await this.api.pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      this.subscribed.set(false);
    } catch {
      this.toast.show('Could not disable notifications', 'err');
    } finally {
      this.busy.set(false);
    }
  }
}
