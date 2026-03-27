"use client";

import { useEffect, useRef } from "react";

type WarpParticle = {
  x: number;
  y: number;
  z: number;
  speed: number;
  iconIndex: number;
  size: number;
  rotation: number;
  spin: number;
};

const WARP_ICONS = [
  "/images/socialize/heart_1.svg",
  "/images/socialize/laugh_1.svg",
  "/images/socialize/laugh_2.svg",
  "/images/socialize/smile_1.svg",
  "/images/socialize/smile_2.svg",
  "/images/socialize/tongue_1.svg",
];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function respawnParticle(p: WarpParticle) {
  p.x = randomBetween(-1.1, 1.1);
  p.y = randomBetween(-1.1, 1.1);
  p.z = randomBetween(0.12, 1.25);
  p.speed = randomBetween(1.35, 2.3);
  p.iconIndex = Math.floor(Math.random() * WARP_ICONS.length);
  p.size = randomBetween(10, 40);
  p.rotation = randomBetween(0, Math.PI * 2);
  p.spin = randomBetween(-0.7, 0.7);
}

type LandingWarpProps = {
  speedScale?: number;
};

export function LandingWarp({ speedScale = 1 }: LandingWarpProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const context = ctx;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speedMultiplier = Math.max(0.25, Math.min(3, speedScale));
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const icons = WARP_ICONS.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });

    const particles: WarpParticle[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let lastTs = performance.now();

    function desiredCount() {
      const area = width * height;
      const raw = Math.round(area / 11000);
      return Math.max(56, Math.min(180, raw));
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvasEl.width = Math.round(width * dpr);
      canvasEl.height = Math.round(height * dpr);
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = desiredCount();
      while (particles.length < targetCount) {
        const p: WarpParticle = {
          x: 0,
          y: 0,
          z: 0,
          speed: 0,
          iconIndex: 0,
          size: 0,
          rotation: 0,
          spin: 0,
        };
        respawnParticle(p);
        particles.push(p);
      }
      if (particles.length > targetCount) {
        particles.length = targetCount;
      }
    }

    function frame(ts: number) {
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      context.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const fov = Math.min(width, height) * 0.46;

      for (const p of particles) {
        const step = (reduceMotion ? dt * 0.2 : dt) * speedMultiplier;
        const prevZ = p.z;
        p.z -= step * p.speed;
        p.rotation += p.spin * step;
        if (p.z <= 0.06) {
          respawnParticle(p);
          continue;
        }

        const px = cx + (p.x / p.z) * fov;
        const py = cy + (p.y / p.z) * fov;
        const prevPx = cx + (p.x / Math.max(prevZ, 0.061)) * fov;
        const prevPy = cy + (p.y / Math.max(prevZ, 0.061)) * fov;
        const scale = Math.min(1.25, 1 / Math.max(p.z, 0.12));
        const size = p.size * scale * 0.72;

        if (
          px < -120 ||
          px > width + 120 ||
          py < -120 ||
          py > height + 120
        ) {
          respawnParticle(p);
          continue;
        }

        const icon = icons[p.iconIndex];
        if (!icon.complete) continue;
        const alpha = Math.min(0.9, Math.max(0.24, 1 - p.z * 0.68));

        // Faint trailing ghost for a warp feel.
        context.save();
        context.globalAlpha = alpha * 0.18;
        context.translate(prevPx, prevPy);
        context.rotate(p.rotation);
        context.drawImage(icon, -size / 2, -size / 2, size, size);
        context.restore();

        context.save();
        context.globalAlpha = alpha;
        context.translate(px, py);
        context.rotate(p.rotation);
        context.drawImage(icon, -size / 2, -size / 2, size, size);
        context.restore();
      }

      raf = window.requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [speedScale]);

  return <canvas ref={canvasRef} className="landing-warp-canvas" aria-hidden />;
}
