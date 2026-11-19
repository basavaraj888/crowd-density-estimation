export type Level = "Low" | "Medium" | "High" | "Critical";
export type Source = "image" | "video" | "webcam";
export type ModelName = "Classical SVM" | "MCNN" | "CSRNet";

export interface HealthResponse {
  status: "ok";
  model: string;
  mode: "simulation" | "real";
  gpu: boolean;
}

export interface PredictImageResponse {
  count: number;
  level: Level;
  density_map_url: string;
  overlay_url: string;
  zones: number[][];
  processing_ms: number;
}

export interface VideoFrame {
  t: number;
  count: number;
  level: Level;
  overlay_url: string;
}

export interface PredictVideoResponse {
  frames: VideoFrame[];
  peak: number;
  avg: number;
}

/** Normalised (0..1) head position. Only present in mock mode. */
export interface Point {
  x: number;
  y: number;
}

export interface LiveFrame {
  count: number;
  level: Level;
  zones: number[][];
  timestamp: string;
  points?: Point[];
}

export interface HistoryItem {
  id: string;
  source: Source;
  filename: string;
  count: number;
  level: Level;
  model: string;
  created_at: string;
}

export type NewHistoryItem = Omit<HistoryItem, "id" | "created_at">;

export interface ModelMetric {
  name: ModelName;
  mae: number;
  rmse: number;
  fps: number;
}

export interface ScatterPoint {
  gt: number;
  pred: number;
}

export interface MetricsResponse {
  models: ModelMetric[];
  scatter: ScatterPoint[];
}

export interface Settings {
  low_max: number;
  medium_max: number;
  high_max: number;
  alarm_sound: boolean;
  email_alert: boolean;
  telegram_alert: boolean;
  model: ModelName;
  zone_grid: number;
  source_url: string;
  email_to?: string;
  telegram_chat_id?: string;
}

export interface PreprocessResponse {
  original: string;
  resized: string;
  grayscale: string;
  equalized: string;
  histograms: { original: number[]; equalized: number[] };
}
