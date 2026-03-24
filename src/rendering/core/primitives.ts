export type CanvasRect = { x: number; y: number; w: number; h: number };

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRoundedRect(ctx: CanvasRenderingContext2D, rect: CanvasRect, r: number) {
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.fill();
}

export function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  r: number,
  lineWidth: number
) {
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, r);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function fitText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}...`;
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
  lineHeight: number
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = words[i];
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines) lines.push(current);

  const consumedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (consumedWords < words.length) {
    const lastIndex = Math.min(maxLines - 1, lines.length - 1);
    let line = lines[lastIndex] ?? "";
    while (line.length > 0 && ctx.measureText(`${line}...`).width > maxWidth) {
      line = line.slice(0, -1);
    }
    lines[lastIndex] = `${line}...`;
  }

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

export function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

export function alphaHex(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex, "#000000");
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const channel = Math.round(safeAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${normalized}${channel}`;
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dest: CanvasRect,
  zoom = 1
) {
  const scale = Math.max(dest.w / srcW, dest.h / srcH) * zoom;
  const sw = dest.w / scale;
  const sh = dest.h / scale;
  const sx = (srcW - sw) / 2;
  const sy = (srcH - sh) / 2;
  ctx.drawImage(source, sx, sy, sw, sh, dest.x, dest.y, dest.w, dest.h);
}

export function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: CanvasRect,
  color: string
) {
  const width = Math.max(1, Math.round(rect.w));
  const height = Math.max(1, Math.round(rect.h));
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offscreenCtx = offscreen.getContext("2d");
  if (!offscreenCtx) return;

  offscreenCtx.drawImage(image, 0, 0, width, height);
  offscreenCtx.globalCompositeOperation = "source-in";
  offscreenCtx.fillStyle = color;
  offscreenCtx.fillRect(0, 0, width, height);
  ctx.drawImage(offscreen, rect.x, rect.y, rect.w, rect.h);
}
