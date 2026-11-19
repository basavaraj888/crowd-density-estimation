import type { Level, Settings } from "./types";

export const LEVELS: Level[] = ["Low", "Medium", "High", "Critical"];

export const DEFAULT_SETTINGS: Settings = {
  low_max: 50,
  medium_max: 150,
  high_max: 300,
  alarm_sound: true,
  email_alert: false,
  telegram_alert: false,
  model: "CSRNet",
  zone_grid: 3,
  source_url: "",
  email_to: "",
  telegram_chat_id: "",
};

export function levelFor(count: number, s: Pick<Settings, "low_max" | "medium_max" | "high_max">): Level {
  if (count <= s.low_max) return "Low";
  if (count <= s.medium_max) return "Medium";
  if (count <= s.high_max) return "High";
  return "Critical";
}

export const levelRank = (l: Level) => LEVELS.indexOf(l);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
