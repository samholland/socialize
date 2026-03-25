import { FONT_STACK } from "@/components/preview-canvas/constants";
import { alphaHex, fillRoundedRect, strokeRoundedRect } from "./primitives";

type StatusBarLayout = {
  screen: { x: number; y: number; w: number; h: number };
  scale: number;
};

type StatusBarTone = "auto" | "light" | "dark";

type DrawUnifiedStatusBarOptions = {
  tone?: StatusBarTone;
  fallbackTone?: "light" | "dark";
  timeLabel?: string;
};

function estimateLuminance(
  ctx: CanvasRenderingContext2D,
  layout: StatusBarLayout
): number | null {
  const s = layout.scale;
  const sampleX = Math.round(layout.screen.x + 18 * s);
  const sampleY = Math.round(layout.screen.y + 12 * s);
  const sampleW = Math.max(1, Math.round(layout.screen.w - 36 * s));
  const sampleH = Math.max(1, Math.round(28 * s));

  try {
    const image = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
    const { data } = image;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      const a = data[i + 3] / 255;
      if (a < 0.05) continue;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count += 1;
    }
    if (count === 0) return null;
    return sum / count;
  } catch {
    return null;
  }
}

function resolveTone(
  ctx: CanvasRenderingContext2D,
  layout: StatusBarLayout,
  tone: StatusBarTone,
  fallbackTone: "light" | "dark"
): "light" | "dark" {
  if (tone !== "auto") return tone;
  const luminance = estimateLuminance(ctx, layout);
  if (luminance == null) return fallbackTone;
  return luminance > 0.56 ? "dark" : "light";
}

export function drawUnifiedStatusBar(
  ctx: CanvasRenderingContext2D,
  layout: StatusBarLayout,
  {
    tone = "auto",
    fallbackTone = "dark",
    timeLabel = "11:13",
  }: DrawUnifiedStatusBarOptions = {}
) {
  const s = layout.scale;
  const resolvedTone = resolveTone(ctx, layout, tone, fallbackTone);
  const fg = resolvedTone === "light" ? "#ffffff" : "#1f2430";
  const muted = resolvedTone === "light" ? alphaHex("#ffffff", 0.38) : alphaHex(fg, 0.28);
  const timeX = layout.screen.x + 44 * s;
  const timeY = layout.screen.y + 34 * s;
  const batteryW = 22 * s;
  const batteryH = 12 * s;
  const batteryX = layout.screen.x + layout.screen.w - 58 * s;
  const batteryY = layout.screen.y + 22 * s;
  const capW = 2.5 * s;
  const capH = 5 * s;
  const signalRight = batteryX - 10 * s;
  const signalBaseY = batteryY + batteryH;
  const barW = 2.5 * s;
  const barGap = 2 * s;
  const barHeights = [5, 8, 10, 13].map((value) => value * s);

  ctx.fillStyle = fg;
  ctx.font = `600 ${16 * s}px ${FONT_STACK}`;
  ctx.fillText(timeLabel, timeX, timeY);

  barHeights.forEach((height, index) => {
    const x =
      signalRight - (barHeights.length - index) * barW - (barHeights.length - 1 - index) * barGap;
    ctx.fillStyle = index === barHeights.length - 1 ? muted : fg;
    fillRoundedRect(
      ctx,
      {
        x,
        y: signalBaseY - height,
        w: barW,
        h: height,
      },
      1.4 * s
    );
  });

  ctx.strokeStyle = fg;
  strokeRoundedRect(
    ctx,
    {
      x: batteryX,
      y: batteryY,
      w: batteryW,
      h: batteryH,
    },
    6 * s,
    Math.max(1, 1.6 * s)
  );

  ctx.fillStyle = muted;
  fillRoundedRect(
    ctx,
    {
      x: batteryX + 2.5 * s,
      y: batteryY + 2.5 * s,
      w: batteryW - 7 * s,
      h: batteryH - 5 * s,
    },
    3 * s
  );

  ctx.fillStyle = fg;
  fillRoundedRect(
    ctx,
    {
      x: batteryX + 2.5 * s,
      y: batteryY + 2.5 * s,
      w: batteryW - 7 * s,
      h: batteryH - 5 * s,
    },
    3 * s
  );

  ctx.fillRect(
    batteryX + batteryW + 1.8 * s,
    batteryY + (batteryH - capH) / 2,
    capW,
    capH
  );
}
