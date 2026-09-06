import { STATE_VERSION, createInitialState, type AppState } from "./state";

/**
 * Persistence for the live draft.
 *
 * A draft in progress is the one thing in this app that cannot be
 * regenerated, so it is written on every state transition and read back on
 * load. The adapter interface is deliberately tiny — a server-backed
 * implementation (the repo already speaks Upstash Redis for the lottery)
 * drops in behind the same three methods without the UI changing.
 *
 * The default adapter is `localStorage`: writes are synchronous, survive a
 * refresh, an accidental close and navigating away, and keep working with
 * no network at all — which is what a draft room actually needs.
 */

export interface PersistenceAdapter {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

export const STORAGE_KEY = "fh-draft-assistant/v1";

/** Reviving a stored blob: shape errors fall back to a fresh state. */
export function deserialize(raw: string): AppState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== STATE_VERSION) return null;
    if (!parsed.league || !parsed.draft || !Array.isArray(parsed.sources)) return null;

    // Object keys survive JSON as strings; the draft indexes picks by number.
    const picks = Object.fromEntries(
      Object.entries(parsed.draft.picks ?? {}).map(([key, pick]) => [Number(key), pick]),
    );

    return {
      ...(parsed as AppState),
      draft: { ...parsed.draft, picks },
    };
  } catch {
    return null;
  }
}

export function createLocalStorageAdapter(key = STORAGE_KEY): PersistenceAdapter {
  const available = () => {
    try {
      return typeof window !== "undefined" && window.localStorage !== null;
    } catch {
      return false;
    }
  };

  return {
    async load() {
      if (!available()) return null;
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? deserialize(raw) : null;
      } catch {
        return null;
      }
    },
    async save(state) {
      if (!available()) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // A full or blocked store must never interrupt the draft; the
        // in-memory state stays authoritative for this session.
      }
    },
    async clear() {
      if (!available()) return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* nothing to do */
      }
    },
  };
}

/** Load persisted state, falling back to a fresh league. */
export async function loadOrCreate(adapter: PersistenceAdapter): Promise<AppState> {
  const stored = await adapter.load();
  return stored ?? createInitialState();
}
