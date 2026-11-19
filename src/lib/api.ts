/**
 * The ONLY place in the app that talks to the backend.
 *
 * HOW TO SWITCH TO THE REAL FASTAPI BACKEND
 *   1. Copy .env.example to .env
 *   2. Set VITE_USE_MOCK=false and VITE_API_URL=http://<your-host>:8000
 *   3. Restart the dev server. No UI changes are needed: every function below
 *      keeps the same signature and return type in both modes.
 *
 * In mock mode every call is answered by ./mock.ts with realistic delays.
 */
import { toast } from "sonner";
import * as mock from "./mock";
import type {
  HealthResponse,
  HistoryItem,
  LiveFrame,
  MetricsResponse,
  NewHistoryItem,
  PredictImageResponse,
  PredictVideoResponse,
  PreprocessResponse,
  Settings,
} from "./types";

export const API_BASE: string = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const USE_MOCK: boolean = (import.meta.env.VITE_USE_MOCK ?? "true") !== "false";

const UPLOAD_TIMEOUT = 120_000;
const DEFAULT_TIMEOUT = 10_000;

/** Absolute URLs (http, blob:, data:) pass through; relative backend paths get API_BASE prepended. */
export function resolveUrl(path: string): string {
  if (!path) return path;
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  return API_BASE + (path.startsWith("/") ? path : `/${path}`);
}

export class ApiError extends Error {}

interface RequestOpts {
  method?: string;
  body?: BodyInit;
  json?: unknown;
  timeout?: number;
  silent?: boolean;
  raw?: boolean;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? DEFAULT_TIMEOUT);
  try {
    const headers: Record<string, string> = {};
    let body = opts.body;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    // NOTE: for FormData we intentionally do NOT set Content-Type (browser adds the boundary).
    const res = await fetch(resolveUrl(path), { method: opts.method ?? "GET", body, headers, signal: ctrl.signal });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const j = await res.json();
        if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      } catch {
        /* non-JSON error */
      }
      throw new ApiError(detail);
    }
    if (opts.raw) return res as unknown as T;
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    const err =
      e instanceof ApiError
        ? e
        : new ApiError((e as Error)?.name === "AbortError" ? "The server took too long to respond." : "Cannot reach the backend server.");
    if (!opts.silent) toast.error(err.message);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const fileForm = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
};

export const api = {
  health: (): Promise<HealthResponse> =>
    USE_MOCK ? mock.mockHealth() : request("/health", { silent: true }),

  predictImage: (file: File): Promise<PredictImageResponse> =>
    USE_MOCK ? mock.mockPredictImage(file) : request("/predict/image", { method: "POST", body: fileForm(file), timeout: UPLOAD_TIMEOUT }),

  predictVideo: (file: File, frameSkip = 5): Promise<PredictVideoResponse> =>
    USE_MOCK
      ? mock.mockPredictVideo(file, frameSkip)
      : request(`/predict/video?frame_skip=${frameSkip}`, { method: "POST", body: fileForm(file), timeout: UPLOAD_TIMEOUT }),

  /** Live stream: WebSocket first, falls back to polling GET /stream/live every second. */
  subscribeLive(cb: (f: LiveFrame) => void): () => void {
    if (USE_MOCK) return mock.mockLive(cb);
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let ws: WebSocket | undefined;
    const startPolling = () => {
      if (stopped || poll) return;
      poll = setInterval(() => {
        request<LiveFrame>("/stream/live", { silent: true }).then((f) => !stopped && cb(f)).catch(() => {});
      }, 1000);
    };
    try {
      ws = new WebSocket(API_BASE.replace(/^http/, "ws") + "/ws/stream");
      ws.onmessage = (e) => {
        try {
          cb(JSON.parse(e.data));
        } catch {
          /* ignore malformed */
        }
      };
      ws.onerror = startPolling;
      ws.onclose = startPolling;
    } catch {
      startPolling();
    }
    return () => {
      stopped = true;
      if (poll) clearInterval(poll);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  },

  mjpegUrl: () => resolveUrl("/stream/mjpeg"),

  history: (): Promise<HistoryItem[]> => (USE_MOCK ? mock.mockHistory() : request("/history")),
  deleteHistory: (id: string): Promise<void> =>
    USE_MOCK ? mock.mockDeleteHistory(id) : request(`/history/${id}`, { method: "DELETE" }),
  /** Not in the original contract; backend should expose POST /history to persist manual saves. */
  addHistory: (item: NewHistoryItem): Promise<HistoryItem> =>
    USE_MOCK ? mock.mockAddHistory(item) : request("/history", { method: "POST", json: item }),
  historyCsvUrl: () => resolveUrl("/history/export.csv"),

  metrics: (): Promise<MetricsResponse> => (USE_MOCK ? mock.mockMetrics() : request("/metrics")),

  async getSettings(): Promise<Settings> {
    if (USE_MOCK) {
      await mock.delay(150, 300);
      return mock.readLocalSettings();
    }
    try {
      const s = await request<Settings>("/settings", { silent: true });
      const merged = { ...mock.readLocalSettings(), ...s };
      mock.writeLocalSettings(merged);
      return merged;
    } catch {
      return mock.readLocalSettings(); // localStorage fallback
    }
  },
  async putSettings(s: Settings): Promise<Settings> {
    mock.writeLocalSettings(s); // always mirror locally
    if (USE_MOCK) {
      await mock.delay(250, 500);
      return s;
    }
    return request<Settings>("/settings", { method: "PUT", json: s });
  },

  /** Mock mode runs the real canvas pipeline on `file`; real mode sends it to the backend. */
  preprocess: (file: File): Promise<PreprocessResponse> =>
    USE_MOCK
      ? mock.mockPreprocess(file)
      : request("/preprocess", {
          method: "POST",
          body: fileForm(file),
          timeout: UPLOAD_TIMEOUT,
        }),

  readCachedSettings: () => mock.readLocalSettings(),
};
