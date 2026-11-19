import type { Point } from "./types";

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function jet(v: number): [number, number, number] {
  return [clamp(1.5 - Math.abs(4 * v - 3)) * 255, clamp(1.5 - Math.abs(4 * v - 2)) * 255, clamp(1.5 - Math.abs(4 * v - 1)) * 255];
}

/** Count points per cell of an n x n grid (rows top→bottom). */
export function computeZones(points: Point[], n: number): number[][] {
  const z = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (const p of points) {
    const r = Math.min(n - 1, Math.floor(p.y * n));
    const c = Math.min(n - 1, Math.floor(p.x * n));
    z[r][c]++;
  }
  return z;
}

/** Draws a jet-coloured Gaussian density map (transparent background) into the given canvas. */
export function drawDensity(canvas: HTMLCanvasElement, points: Point[], w = 192, h = 108) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const grid = new Float32Array(w * h);
  const sigma = Math.max(2.5, w * 0.022);
  const rad = Math.ceil(sigma * 3);
  const s2 = 2 * sigma * sigma;
  let max = 0;
  for (const p of points) {
    const px = p.x * w;
    const py = p.y * h;
    const x0 = Math.max(0, Math.floor(px - rad));
    const x1 = Math.min(w - 1, Math.ceil(px + rad));
    const y0 = Math.max(0, Math.floor(py - rad));
    const y1 = Math.min(h - 1, Math.ceil(py + rad));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = (x - px) ** 2 + (y - py) ** 2;
        const i = y * w + x;
        grid[i] += Math.exp(-d / s2);
        if (grid[i] > max) max = grid[i];
      }
    }
  }
  const norm = Math.max(max, 2.5);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i] / norm;
    if (v < 0.04) continue;
    const [r, g, b] = jet(v);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.min(1, v * 1.6) * 235;
  }
  ctx.putImageData(img, 0, 0);
}

export function densityDataUrl(points: Point[], w = 192, h = 108) {
  const c = document.createElement("canvas");
  drawDensity(c, points, w, h);
  return c.toDataURL("image/png");
}

/** Composites an image with a density map at the given opacity and returns a JPEG data URL. */
export async function composeOverlay(imageUrl: string, densityUrl: string, opacity: number) {
  const [img, dens] = await Promise.all([loadImage(imageUrl), loadImage(densityUrl)]);
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(dens, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.92);
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

const gauss = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Generates a clustered crowd of `count` people. */
export function generateCrowd(count: number, clusters = 2 + Math.floor(Math.random() * 4)): Point[] {
  const centers = Array.from({ length: clusters }, () => ({
    x: 0.15 + Math.random() * 0.7,
    y: 0.25 + Math.random() * 0.6,
    s: 0.05 + Math.random() * 0.1,
  }));
  return Array.from({ length: count }, () => {
    if (Math.random() < 0.15) return { x: Math.random(), y: 0.1 + Math.random() * 0.9 };
    const c = centers[Math.floor(Math.random() * centers.length)];
    return { x: clamp(c.x + gauss() * c.s), y: clamp(c.y + gauss() * c.s * 0.8) };
  });
}

/** A persistent, slowly moving crowd used for live/video simulation. */
export class CrowdSim {
  people: { x: number; y: number; vx: number; vy: number }[] = [];
  centers = Array.from({ length: 3 }, () => ({ x: 0.2 + Math.random() * 0.6, y: 0.35 + Math.random() * 0.5 }));

  step(target: number) {
    while (this.people.length < target) {
      const [p] = generateCrowd(1, 1);
      const c = this.centers[Math.floor(Math.random() * this.centers.length)];
      const near = Math.random() < 0.7;
      this.people.push({
        x: near ? clamp(c.x + gauss() * 0.08) : p.x,
        y: near ? clamp(c.y + gauss() * 0.07) : p.y,
        vx: 0,
        vy: 0,
      });
    }
    if (this.people.length > target) this.people.splice(0, this.people.length - target);
    for (const c of this.centers) {
      c.x = clamp(c.x + gauss() * 0.004);
      c.y = Math.max(0.25, Math.min(0.9, c.y + gauss() * 0.003));
    }
    for (const p of this.people) {
      p.vx = p.vx * 0.8 + gauss() * 0.002;
      p.vy = p.vy * 0.8 + gauss() * 0.0015;
      p.x = clamp(p.x + p.vx);
      p.y = Math.max(0.08, Math.min(1, p.y + p.vy));
    }
    return this.people.map(({ x, y }) => ({ x, y }));
  }
}

export function histogram(data: Uint8ClampedArray) {
  const h = Array(256).fill(0) as number[];
  for (let i = 0; i < data.length; i += 4) h[data[i]]++;
  return h;
}
