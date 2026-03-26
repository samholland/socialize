import { STORY_LAYOUT } from "./constants";
import { fitText } from "@/rendering/core/primitives";

type Rect = { x: number; y: number; w: number; h: number };

export type StoryCtaPillLayout = {
  frame: Rect;
  iconRect: Rect;
  text: string;
  textX: number;
  textY: number;
  cornerRadius: number;
  rotationRad: number;
};

export const STORY_CTA_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';

function trimTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;

  let value = text;
  while (value.length > 0 && ctx.measureText(`${value}...`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return value ? `${value}...` : "";
}

export function computeStoryCtaPillLayout(
  ctx: CanvasRenderingContext2D,
  screen: Rect,
  scale: number,
  ctaText: string,
  offsetX = 0,
  offsetY = 0
): StoryCtaPillLayout {
  const fontSize = 12.6 * scale;
  const iconSize = 16.5 * scale;
  const sidePadding = 14 * scale;
  const iconGap = 9.5 * scale;
  const minWidth = 106 * scale;
  const maxWidth = Math.max(minWidth, screen.w - 22 * scale);
  const height = STORY_LAYOUT.ctaHeight * scale;
  const textBaselineOffset = height * 0.64;

  const seedText = fitText(ctaText || "Learn More", 42);
  ctx.save();
  ctx.font = `700 ${fontSize}px ${STORY_CTA_FONT_STACK}`;
  const maxTextWidth = Math.max(10 * scale, maxWidth - sidePadding * 2 - iconSize - iconGap);
  const text = trimTextToWidth(ctx, seedText, maxTextWidth);
  const textWidth = ctx.measureText(text).width;
  ctx.restore();

  const width = Math.min(
    maxWidth,
    Math.max(minWidth, sidePadding * 2 + iconSize + iconGap + textWidth)
  );
  const x = screen.x + (screen.w - width) / 2 + offsetX;
  const y = screen.y + screen.h - STORY_LAYOUT.ctaYFromBottom * scale + offsetY;

  return {
    frame: { x, y, w: width, h: height },
    iconRect: {
      x: x + sidePadding,
      y: y + (height - iconSize) / 2,
      w: iconSize,
      h: iconSize,
    },
    text,
    textX: x + sidePadding + iconSize + iconGap,
    textY: y + textBaselineOffset,
    cornerRadius: STORY_LAYOUT.ctaRadius * scale,
    rotationRad: (-6 * Math.PI) / 180,
  };
}

export function isPointInStoryCtaPill(
  layout: StoryCtaPillLayout,
  x: number,
  y: number
): boolean {
  const centerX = layout.frame.x + layout.frame.w / 2;
  const centerY = layout.frame.y + layout.frame.h / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  const cos = Math.cos(-layout.rotationRad);
  const sin = Math.sin(-layout.rotationRad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return (
    localX >= -layout.frame.w / 2 &&
    localX <= layout.frame.w / 2 &&
    localY >= -layout.frame.h / 2 &&
    localY <= layout.frame.h / 2
  );
}
