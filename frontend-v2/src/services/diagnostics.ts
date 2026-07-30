/**
 * Diagnostics collector for the in-app bug reporter.
 *
 * Holds small ring buffers of recent activity — API calls (fed by an axios
 * interceptor in api.ts), route changes (fed by the BugReportHost), and console
 * errors (fed by a one-time console patch) — plus device/build info. When a
 * tester files a report, `collectDiagnostics()` snapshots all of it so the
 * report is machine-actionable without a back-and-forth.
 *
 * Metadata only: we never record request/response bodies (PII / token leakage).
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

const RING_SIZE = 20;
const MAX_ERROR_LEN = 600;

export interface ApiCallEntry {
  method: string;
  url: string;
  status: number | null;
  ms: number;
  at: string; // ISO time set by the caller (we never call Date.now in tests)
}

export interface RouteEntry {
  route: string;
  at: string;
}

/**
 * A step the user took, or a stage the app reached, inside a multi-step native
 * flow. Added for the evidence-attach pipeline, where every failure mode is a
 * silent fallback: a picker that never presents, a picker that returns
 * `canceled`, a compression fallback, an asset dropped by a size gate. Two iOS
 * reports of "attaching doesn't work" (2026-07-12 video, 2026-07-30 photos)
 * arrived with an empty console-error buffer, no Sentry event, and not one
 * upload API call — there was simply nothing recorded between the tap and the
 * user giving up. This buffer is what makes the next one diagnosable.
 */
export interface ActionEntry {
  stage: string;
  at: string;
  detail?: Record<string, unknown>;
}

class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly size: number) {}
  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.size) {
      this.items.splice(0, this.items.length - this.size);
    }
  }
  snapshot(): T[] {
    return [...this.items];
  }
  clear(): void {
    this.items = [];
  }
}

const apiCalls = new RingBuffer<ApiCallEntry>(RING_SIZE);
const routes = new RingBuffer<RouteEntry>(RING_SIZE);
const consoleErrors = new RingBuffer<string>(RING_SIZE);
// Deliberately larger than RING_SIZE: one attach attempt emits several stages,
// and the user often retries a few times before giving up and filing a report.
const actions = new RingBuffer<ActionEntry>(40);

function nowIso(): string {
  // new Date() with no args is fine at runtime; tests stub Date where needed.
  return new Date().toISOString();
}

export function recordApiCall(entry: Omit<ApiCallEntry, 'at'> & { at?: string }): void {
  apiCalls.push({ ...entry, at: entry.at ?? nowIso() });
}

/**
 * Record a step in a native flow. Never throws and never records user content —
 * `detail` is for small scalars (counts, sizes, permission status, platform),
 * never file paths, URIs, or anything the user typed.
 */
export function recordAction(stage: string, detail?: Record<string, unknown>): void {
  try {
    actions.push({ stage, at: nowIso(), ...(detail ? { detail } : {}) });
  } catch {
    // diagnostics must never break the flow they are observing
  }
}

export function recordRoute(route: string): void {
  if (!route) return;
  const last = routes.snapshot().slice(-1)[0];
  if (last && last.route === route) return; // de-dupe repeats
  routes.push({ route, at: nowIso() });
}

export function recordConsoleError(args: unknown[]): void {
  try {
    const msg = args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ')
      .slice(0, MAX_ERROR_LEN);
    if (msg.trim()) consoleErrors.push(msg);
  } catch {
    // never let diagnostics crash the app
  }
}

let consolePatched = false;

/**
 * Tee console.error / console.warn into the ring buffer once. Preserves the
 * original behavior (still logs to the console / Sentry).
 */
export function installConsoleCapture(): void {
  if (consolePatched) return;
  consolePatched = true;

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    recordConsoleError(args);
    origError(...args);
  };

  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    recordConsoleError(args);
    origWarn(...args);
  };
}

export function getCurrentRoute(): string | null {
  const last = routes.snapshot().slice(-1)[0];
  return last ? last.route : null;
}

function readBuildInfo() {
  const c = Constants as unknown as {
    expoConfig?: { version?: string };
    nativeAppVersion?: string | null;
    nativeBuildVersion?: string | null;
  };
  // expo-application reads the version/build straight from the compiled native
  // binary (the same source Sentry uses for `app_build`). Constants.native*
  // returns null in SDK 55 dev/release builds, which is why build_number was
  // NULL on every bug report. expo-application is native-only — on web both
  // values are null, so fall back to the Constants/expoConfig values there.
  const nativeBuild = Application.nativeBuildVersion ?? null;
  const nativeVersion = Application.nativeApplicationVersion ?? null;
  return {
    app_version: nativeVersion || c.nativeAppVersion || c.expoConfig?.version || null,
    build_number: nativeBuild || c.nativeBuildVersion || null,
  };
}

export interface Diagnostics {
  platform: string;
  os_version: string | null;
  device_model: string | null;
  app_version: string | null;
  build_number: string | null;
  current_route: string | null;
  breadcrumbs: RouteEntry[];
  recent_api_calls: ApiCallEntry[];
  recent_console_errors: string[];
  /** Rides inside the existing `extra` jsonb column, so no migration or
   *  backend allow-list change is needed to persist it. */
  extra: { recent_actions: ActionEntry[] };
}

export function collectDiagnostics(): Diagnostics {
  const build = readBuildInfo();
  return {
    platform: Platform.OS,
    os_version: (Device.osVersion as string | null) ?? null,
    device_model: (Device.modelName as string | null) ?? null,
    app_version: build.app_version,
    build_number: build.build_number,
    current_route: getCurrentRoute(),
    breadcrumbs: routes.snapshot(),
    recent_api_calls: apiCalls.snapshot(),
    recent_console_errors: consoleErrors.snapshot(),
    extra: { recent_actions: actions.snapshot() },
  };
}

/** Test/utility helper: wipe all buffers. */
export function _resetDiagnostics(): void {
  apiCalls.clear();
  routes.clear();
  consoleErrors.clear();
  actions.clear();
}
