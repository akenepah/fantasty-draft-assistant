"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  createLocalStorageAdapter,
  loadOrCreate,
  type PersistenceAdapter,
} from "@/lib/domain/persistence";
import { derive, type Derived } from "@/lib/domain/selectors";
import { createInitialState, reducer, type Action, type AppState } from "@/lib/domain/state";

/**
 * The one place application state lives.
 *
 * Screens call `useAppState()` for the current league and draft, `derived`
 * for anything computed from them, and `dispatch` to change them. Nothing
 * else holds league or draft data, so a pick recorded in the Draft Room is
 * immediately true on every other screen.
 */

type AppStateContextValue = {
  state: AppState;
  derived: Derived;
  dispatch: (action: Action) => void;
  /** False until persisted state has been read back. */
  hydrated: boolean;
  /** Clears persisted state and starts a brand new league. */
  resetAll: () => void;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  children,
  adapter,
}: {
  children: ReactNode;
  /** Injectable for tests; defaults to localStorage. */
  adapter?: PersistenceAdapter;
}) {
  const storage = useMemo(() => adapter ?? createLocalStorageAdapter(), [adapter]);
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // Read persisted state once on mount. Until that lands we render the
  // default league rather than blocking, so the shell paints immediately.
  useEffect(() => {
    let cancelled = false;
    loadOrCreate(storage).then((loaded) => {
      if (cancelled) return;
      dispatch({ type: "state/replace", state: loaded });
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // Persist every transition after hydration. Writing before it would race
  // the initial read and could overwrite a draft in progress with defaults.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void storage.save(state);
  }, [state, storage]);

  const resetAll = useCallback(() => {
    void storage.clear();
    dispatch({ type: "state/replace", state: createInitialState() });
  }, [storage]);

  const derived = useMemo(() => derive(state), [state]);

  const value = useMemo(
    () => ({ state, derived, dispatch, hydrated, resetAll }),
    [state, derived, hydrated, resetAll],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside <AppStateProvider>.");
  }
  return context;
}

/** Convenience for the many call sites that only need the league. */
export function useLeague() {
  return useAppState().state.league;
}
