import type { Lead, LeadActivity } from "./types";

/**
 * Offline outbox for lead writes. When an agent has no signal, creates,
 * updates and timeline entries are queued (in order) in local storage and
 * replayed when the connection returns. Pure and storage-agnostic so it can be
 * unit-tested without a browser.
 */

export type OutboxOp =
  | { kind: "create"; lead: Lead; operatorId: string }
  | { kind: "update"; id: string; patch: Partial<Lead> }
  | { kind: "activity"; id: string; activity: LeadActivity; patch: Partial<Lead> };

export type QueuedOp = OutboxOp & { opId: string; queuedAt: string };

/** What the sender reports for one op: done, try again later, or give up (and why). */
export type SendResult = { status: "ok" } | { status: "retry" } | { status: "drop"; reason: string };

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readQueue(storage: StorageLike, key: string): QueuedOp[] {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(storage: StorageLike, key: string, ops: QueuedOp[]) {
  try {
    if (ops.length) storage.setItem(key, JSON.stringify(ops));
    else storage.removeItem(key);
  } catch {
    // Storage full or blocked: the op stays only in memory for this visit.
  }
}

export function enqueue(storage: StorageLike, key: string, op: OutboxOp, now = new Date(), opId = randomId()): QueuedOp[] {
  const next = [...readQueue(storage, key), { ...op, opId, queuedAt: now.toISOString() }];
  writeQueue(storage, key, next);
  return next;
}

/**
 * Sends queued ops oldest first. Stops at the first "retry" (still offline) so
 * order is preserved; "drop" removes an op the server will never accept (e.g.
 * access revoked) and reports it.
 */
export async function drain(
  storage: StorageLike,
  key: string,
  send: (op: QueuedOp) => Promise<SendResult>,
): Promise<{ sent: number; remaining: number; dropped: { op: QueuedOp; reason: string }[] }> {
  const queue = readQueue(storage, key);
  const dropped: { op: QueuedOp; reason: string }[] = [];
  let sent = 0;
  let i = 0;
  for (; i < queue.length; i++) {
    const result = await send(queue[i]);
    if (result.status === "retry") break;
    if (result.status === "drop") dropped.push({ op: queue[i], reason: result.reason });
    else sent += 1;
    // Persist progress after each op so a crash mid-drain never replays a sent op.
    writeQueue(storage, key, queue.slice(i + 1));
  }
  return { sent, remaining: queue.length - i, dropped };
}

/** Overlay queued (not yet synced) changes on the last known server rows. */
export function applyPending(leads: Lead[], ops: QueuedOp[]): Lead[] {
  let out = leads;
  for (const op of ops) {
    if (op.kind === "create") {
      if (!out.some((l) => l.id === op.lead.id)) out = [op.lead, ...out];
    } else if (op.kind === "update") {
      out = out.map((l) => (l.id === op.id ? { ...l, ...op.patch } : l));
    } else {
      out = out.map((l) =>
        l.id === op.id && !(l.activities ?? []).some((a) => a.id === op.activity.id)
          ? { ...l, ...op.patch, activities: [op.activity, ...(l.activities ?? [])] }
          : l,
      );
    }
  }
  return out;
}

/**
 * Supabase/PostgREST network failures come back as error objects rather than
 * throws; tell those (retry later) apart from real rejections (RLS, validation).
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { message?: unknown; status?: unknown; code?: unknown; name?: unknown };
  const message = typeof e.message === "string" ? e.message : String(error);
  if (e.name === "TypeError" || e.status === 0) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|timed? ?out/i.test(message);
}

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
