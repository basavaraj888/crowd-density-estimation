/**
 * Simulated backend used when VITE_USE_MOCK=true. Only src/lib/api.ts imports this file.
 */
import { CrowdSim, computeZones, densityDataUrl, generateCrowd, histogram, loadImage } from "./heatmap";
import { DEFAULT_SETTINGS, levelFor } from "./levels";
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

export const delay = (min = 300, max = 1500) =>
  new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)));

const SETTINGS_KEY = "cdes.settings";

export function readLocalSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}
export function writeLocalSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export async function mockHealth(): Promise<HealthResponse> {
  await delay(150, 400);
  return { status: "ok", model: readLocalSettings().model, mode: "simulation", gpu: false };
}

export async function mockPredictImage(file: File): Promise<PredictImageResponse> {
  const started = performance.now();
  const s = readLocalSettings();
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  const count = 15 + Math.floor(Math.random() * 380);
  const points = generateCrowd(count);
  const ratio = img.naturalHeight / img.naturalWidth;
  const w = 220;
  const density = densityDataUrl(points, w, Math.max(60, Math.round(w * ratio)));
  const { composeOverlay } = await import("./heatmap");
  const overlay = await composeOverlay(url, density, 0.6);
  URL.revokeObjectURL(url);
  await delay();
  return {
    count,
    level: levelFor(count, s),
    density_map_url: density,
    overlay_url: overlay,
    zones: computeZones(points, s.zone_grid),
    processing_ms: Math.round(performance.now() - started),
  };
}

export async function mockPredictVideo(file: File, frameSkip: number): Promise<PredictVideoResponse> {
  const s = readLocalSettings();
  const url = URL.createObjectURL(file);
  const duration = await new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(isFinite(v.duration) ? v.duration : 30);
    v.onerror = () => reject(new Error("This video format can't be decoded by your browser."));
    v.src = url;
  });
  URL.revokeObjectURL(url);
  const step = Math.max(frameSkip / 25, duration / 150);
  const sim = new CrowdSim();
  let count = 60 + Math.random() * 120;
  let drift = (Math.random() - 0.5) * 4;
  const frames = [];
  for (let t = 0; t <= duration; t += step) {
    if (Math.random() < 0.05) drift = (Math.random() - 0.45) * 8;
    count = Math.max(5, Math.min(420, count + drift + (Math.random() - 0.5) * 10));
    const c = Math.round(count);
    const pts = sim.step(c);
    frames.push({ t: +t.toFixed(2), count: c, level: levelFor(c, s), overlay_url: densityDataUrl(pts, 128, 72) });
  }
  await delay(600, 1500);
  const counts = frames.map((f) => f.count);
  return {
    frames,
    peak: Math.max(...counts),
    avg: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length),
  };
}

/** Starts a simulated live stream; returns an unsubscribe function. */
export function mockLive(cb: (f: LiveFrame) => void) {
  const sim = new CrowdSim();
  let count = 90;
  let surge = 0;
  const tick = () => {
    const s = readLocalSettings();
    if (surge <= 0 && Math.random() < 0.02) surge = 12 + Math.floor(Math.random() * 10);
    const base = surge > 0 ? s.high_max + 30 : (s.low_max + s.medium_max) / 1.6;
    if (surge > 0) surge--;
    count += (base - count) * 0.12 + (Math.random() - 0.5) * 14;
    count = Math.max(0, count);
    const c = Math.round(count);
    const points = sim.step(c);
    cb({ count: c, level: levelFor(c, s), zones: computeZones(points, s.zone_grid), timestamp: new Date().toISOString(), points });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

let historyStore: HistoryItem[] | null = null;
const FILES = ["railway_platform.jpg", "temple_festival.mp4", "mall_atrium.png", "stadium_gate.jpg", "metro_exit.mov", "campus_fest.jpg", "bus_stand.webm", "concert_front.jpg"];
function history() {
  if (!historyStore) {
    const models = ["CSRNet", "MCNN", "Classical SVM"];
    historyStore = Array.from({ length: 18 }, (_, i) => {
      const source = (["image", "video", "webcam"] as const)[i % 3];
      const count = 10 + Math.floor(Math.random() * 420);
      return {
        id: `h${1000 + i}`,
        source,
        filename: source === "webcam" ? "webcam_session" : FILES[i % FILES.length],
        count,
        level: levelFor(count, DEFAULT_SETTINGS),
        model: models[i % 4 === 0 ? 1 : i % 5 === 0 ? 2 : 0],
        created_at: new Date(Date.now() - i * 5.3 * 3600_000 - Math.random() * 3600_000).toISOString(),
      };
    });
  }
  return historyStore;
}
export async function mockHistory() {
  await delay(300, 700);
  return [...history()];
}
export async function mockDeleteHistory(id: string) {
  await delay(200, 400);
  historyStore = history().filter((h) => h.id !== id);
}
export async function mockAddHistory(item: NewHistoryItem): Promise<HistoryItem> {
  await delay(200, 400);
  const full = { ...item, id: `h${Date.now()}`, created_at: new Date().toISOString() };
  historyStore = [full, ...history()];
  return full;
}

export async function mockMetrics(): Promise<MetricsResponse> {
  await delay(400, 900);
  const scatter = Array.from({ length: 40 }, () => {
    const gt = Math.round(20 + Math.random() * 1100);
    return { gt, pred: Math.max(0, Math.round(gt * (1 + (Math.random() - 0.5) * 0.3))) };
  });
  return {
    models: [
      { name: "Classical SVM", mae: 110, rmse: 160, fps: 25 },
      { name: "MCNN", mae: 110, rmse: 173, fps: 14 },
      { name: "CSRNet", mae: 68, rmse: 115, fps: 9 },
    ],
    scatter,
  };
}

export async function mockPreprocess(file: File): Promise<PreprocessResponse> {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  const original = canvasFrom(img, img.naturalWidth, img.naturalHeight, 1200).toDataURL("image/jpeg", 0.9);
  const resized = canvasFrom(img, 224, 224);
  const ctx = resized.getContext("2d")!;
  const data = ctx.getImageData(0, 0, 224, 224);
  const gray = new ImageData(new Uint8ClampedArray(data.data), 224, 224);
  for (let i = 0; i < gray.data.length; i += 4) {
    const y = 0.299 * gray.data[i] + 0.587 * gray.data[i + 1] + 0.114 * gray.data[i + 2];
    gray.data[i] = gray.data[i + 1] = gray.data[i + 2] = y;
  }
  const hist = histogram(gray.data);
  const total = 224 * 224;
  const cdf: number[] = [];
  hist.reduce((acc, v, i) => ((cdf[i] = acc + v), acc + v), 0);
  const cdfMin = cdf.find((v) => v > 0) ?? 0;
  const lut = cdf.map((v) => Math.round(((v - cdfMin) / Math.max(1, total - cdfMin)) * 255));
  const eq = new ImageData(new Uint8ClampedArray(gray.data), 224, 224);
  for (let i = 0; i < eq.data.length; i += 4) eq.data[i] = eq.data[i + 1] = eq.data[i + 2] = lut[eq.data[i]];
  const toUrl = (d: ImageData) => {
    const c = document.createElement("canvas");
    c.width = 224;
    c.height = 224;
    c.getContext("2d")!.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  };
  URL.revokeObjectURL(url);
  await delay(300, 700);
  return {
    original,
    resized: resized.toDataURL("image/png"),
    grayscale: toUrl(gray),
    equalized: toUrl(eq),
    histograms: { original: hist, equalized: histogram(eq.data) },
  };
}

function canvasFrom(img: HTMLImageElement, w: number, h: number, cap?: number) {
  const scale = cap ? Math.min(1, cap / Math.max(w, h)) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
