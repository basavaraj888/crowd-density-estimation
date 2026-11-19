import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, BarChart3, BookOpen, Cog, Film, History, Image as ImageIcon, LayoutDashboard, Layers, Menu, Users, Video, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/image", label: "Image Analysis", icon: ImageIcon },
  { to: "/video", label: "Video Analysis", icon: Film },
  { to: "/live", label: "Live Monitoring", icon: Video },
  { to: "/preprocess", label: "Preprocessing", icon: Layers },
  { to: "/evaluation", label: "Model Evaluation", icon: BarChart3 },
  { to: "/history", label: "History & Reports", icon: History },
  { to: "/settings", label: "Settings", icon: Cog },
  { to: "/about", label: "About & Method", icon: BookOpen },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-primary",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="bg-gradient-primary shadow-glow grid size-10 place-items-center rounded-xl text-primary-foreground">
        <Users className="size-5" />
      </div>
      <div className="leading-tight">
        <p className="font-semibold">CrowdSense</p>
        <p className="text-[11px] text-muted-foreground">Crowd Density Estimation</p>
      </div>
    </div>
  );
}

function BackendChip() {
  const { backend } = useApp();
  const map = {
    checking: ["Checking…", "bg-muted-foreground"],
    connected: ["Connected", "bg-level-low"],
    mock: ["Mock mode", "bg-muted-foreground"],
    offline: ["Offline", "bg-level-critical"],
  } as const;
  const [label, dot] = map[backend];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs">
      <span className={cn("size-2 rounded-full", dot)} />
      <span className="hidden sm:inline text-muted-foreground">Backend:</span> {label}
    </span>
  );
}

function AlarmBanner() {
  const { alarm, dismissAlarm } = useApp();
  if (!alarm) return null;
  return (
    <div role="alert" className="animate-flash flex items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-destructive-foreground">
      <span className="flex items-center gap-2">
        <Activity className="size-4" />
        ALERT — {alarm.level} crowd density: {alarm.count} people ({alarm.source})
      </span>
      <button onClick={dismissAlarm} aria-label="Dismiss alarm" className="rounded p-1 hover:bg-background/20">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const title = NAV.find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)))?.label ?? "CrowdSense";
  const { running } = useApp();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 lg:flex">
        <Brand />
        <NavList />
        <p className="mt-auto px-2 text-[11px] text-muted-foreground">Final-year project · Dept. of CSE, GECT</p>
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex flex-col gap-6">
            <Brand />
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30">
          <AlarmBanner />
          <header className="flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu />
            </Button>
            <h1 className="text-lg font-semibold">{title}</h1>
            <span className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", running ? "animate-pulse bg-level-low" : "bg-muted-foreground")} />
              {running ? "Live" : "Paused"}
            </span>
            <div className="ml-auto">
              <BackendChip />
            </div>
          </header>
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
