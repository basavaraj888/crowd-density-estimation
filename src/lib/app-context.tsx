import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, USE_MOCK } from "./api";
import { DEFAULT_SETTINGS, levelRank } from "./levels";
import type { Level, LiveFrame, Settings, Source } from "./types";

export interface AlertEntry {
  id: string;
  level: Level;
  count: number;
  source: Source | "live";
  at: string;
}
export type BackendStatus = "checking" | "connected" | "mock" | "offline";

interface Ctx {
  settings: Settings;
  settingsLoaded: boolean;
  saveSettings: (s: Settings) => Promise<void>;
  live: LiveFrame | null;
  liveSeries: { t: string; count: number }[];
  peak: number;
  avg: number;
  running: boolean;
  setRunning: (r: boolean) => void;
  alerts: AlertEntry[];
  alarm: AlertEntry | null;
  dismissAlarm: () => void;
  raiseAlert: (level: Level, count: number, source: AlertEntry["source"]) => void;
  backend: BackendStatus;
  checkHealth: () => Promise<boolean>;
}

const AppCtx = createContext<Ctx | null>(null);

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [0, 0.28, 0.56].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio unavailable */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setLoaded] = useState(false);
  const [live, setLive] = useState<LiveFrame | null>(null);
  const [liveSeries, setSeries] = useState<{ t: string; count: number }[]>([]);
  const [stats, setStats] = useState({ peak: 0, sum: 0, n: 0 });
  const [running, setRunning] = useState(true);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [alarm, setAlarm] = useState<AlertEntry | null>(null);
  const [backend, setBackend] = useState<BackendStatus>("checking");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const prevLevel = useRef<Level>("Low");
  const alarmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const raiseAlert = useCallback((level: Level, count: number, source: AlertEntry["source"]) => {
    const entry: AlertEntry = { id: `${Date.now()}-${Math.random()}`, level, count, source, at: new Date().toISOString() };
    setAlerts((a) => [entry, ...a].slice(0, 50));
    const severe = level === "High" || level === "Critical";
    toast[severe ? "error" : "warning"](`${level} crowd density`, { description: `${count} people detected (${source})` });
    if (severe) {
      setAlarm(entry);
      clearTimeout(alarmTimer.current);
      alarmTimer.current = setTimeout(() => setAlarm(null), 10_000);
      if (settingsRef.current.alarm_sound) beep();
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    return api.subscribeLive((f) => {
      setLive(f);
      setSeries((s) => [...s, { t: new Date(f.timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }), count: f.count }].slice(-60));
      setStats((s) => ({ peak: Math.max(s.peak, f.count), sum: s.sum + f.count, n: s.n + 1 }));
      if (levelRank(f.level) > levelRank(prevLevel.current) && f.level !== "Low") raiseAlert(f.level, f.count, "live");
      prevLevel.current = f.level;
    });
  }, [running, raiseAlert]);

  const checkHealth = useCallback(async () => {
    try {
      await api.health();
      setBackend(USE_MOCK ? "mock" : "connected");
      return true;
    } catch {
      setBackend("offline");
      return false;
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 10_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  const saveSettings = useCallback(async (s: Settings) => {
    const saved = await api.putSettings(s);
    setSettings(saved);
  }, []);

  return (
    <AppCtx.Provider
      value={{
        settings,
        settingsLoaded,
        saveSettings,
        live,
        liveSeries,
        peak: stats.peak,
        avg: stats.n ? Math.round(stats.sum / stats.n) : 0,
        running,
        setRunning,
        alerts,
        alarm,
        dismissAlarm: () => setAlarm(null),
        raiseAlert,
        backend,
        checkHealth,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
