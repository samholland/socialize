import { FEED_ACTION_ICON_PATHS, FEED_NAV_ICON_PATHS, FONT_STACK } from "../constants";
import { drawTintedImage, fitText } from "../utils";
import {
  clipScreen,
  drawAvatarCircle,
  drawFeedMedia,
  drawFeedStatusBar,
  drawMoreIcon,
  drawVerifiedBadge,
  endClip,
  mediaHeightForAspect,
} from "./shared";
import type { DrawFeedSurfaceArgs } from "./types";

function drawCaptionBlock(
  ctx: CanvasRenderingContext2D,
  {
    x,
    y,
    maxWidth,
    maxLines,
    lineHeight,
    username,
    body,
    scale,
  }: {
    x: number;
    y: number;
    maxWidth: number;
    maxLines: number;
    lineHeight: number;
    username: string;
    body: string;
    scale: number;
  }
) {
  const name = fitText(username || "brand", 22);
  const text = body.trim();
  if (!text) {
    ctx.fillStyle = "#1f1f1f";
    ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
    ctx.fillText(name, x, y);
    return;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const lines: Array<{ includeName: boolean; text: string }> = [];
  let wordIndex = 0;
  let isFirstLine = true;

  const measureLine = (lineText: string, includeName: boolean) => {
    if (!includeName) {
      ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
      return ctx.measureText(lineText).width;
    }
    ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
    const nameWidth = ctx.measureText(name).width;
    ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
    return nameWidth + ctx.measureText(` ${lineText}`).width;
  };

  while (lines.length < maxLines && wordIndex < words.length) {
    let candidate = "";
    let consumed = 0;

    for (let i = wordIndex; i < words.length; i += 1) {
      const next = candidate ? `${candidate} ${words[i]}` : words[i];
      if (measureLine(next, isFirstLine) <= maxWidth || candidate.length === 0) {
        candidate = next;
        consumed += 1;
        continue;
      }
      break;
    }

    lines.push({ includeName: isFirstLine, text: candidate });
    wordIndex += consumed;
    isFirstLine = false;
  }

  if (wordIndex < words.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    let trimmed = lines[lastIndex].text;
    while (trimmed.length > 0) {
      const candidate = `${trimmed}...`;
      if (measureLine(candidate, lines[lastIndex].includeName) <= maxWidth) {
        lines[lastIndex].text = candidate;
        break;
      }
      trimmed = trimmed.slice(0, -1).trimEnd();
    }
    if (!lines[lastIndex].text.endsWith("...")) lines[lastIndex].text = "...";
  }

  lines.forEach((line, index) => {
    const lineY = y + index * lineHeight;
    if (line.includeName) {
      ctx.fillStyle = "#1f1f1f";
      ctx.font = `700 ${12.5 * scale}px ${FONT_STACK}`;
      ctx.fillText(name, x, lineY);
      const nameWidth = ctx.measureText(name).width;
      ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
      ctx.fillText(` ${line.text}`, x + nameWidth, lineY);
      return;
    }

    ctx.fillStyle = "#1f1f1f";
    ctx.font = `500 ${12.5 * scale}px ${FONT_STACK}`;
    ctx.fillText(line.text, x, lineY);
  });
}

export async function drawInstagramFeedSurface(args: DrawFeedSurfaceArgs) {
  const {
    ctx,
    layout,
    mediaAspect,
    primaryText,
    cta,
    ctaBgColor,
    ctaTextColor,
    clientName,
    clientVerified,
    clientAvatarUrl,
    loadImageFromUrl,
  } = args;

  const [heartIcon, commentIcon, sendIcon, bookmarkIcon, navHome, navReels, navSend, navSearch, navProfile] =
    await Promise.all([
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[0]),
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[1]),
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[2]),
      loadImageFromUrl(FEED_ACTION_ICON_PATHS[3]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[0]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[1]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[2]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[3]),
      loadImageFromUrl(FEED_NAV_ICON_PATHS[4]),
    ]);

  const s = layout.scale;
  const screen = layout.screen;
  const navH = 80 * s;

  clipScreen(ctx, layout);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);

  drawFeedStatusBar(ctx, layout);

  const toolbarY = screen.y - 28 * s;
  const toolbarH = 30 * s;

  let y = toolbarY + toolbarH;


  y += 55 * s;
  ctx.fillStyle = "#efefef";
  ctx.fillRect(screen.x, y, screen.w, 1 * s);

  const adHeaderY = y + 6 * s;
  const adHeaderH = 52 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(screen.x, adHeaderY, screen.w, adHeaderH);

  await drawAvatarCircle(
    ctx,
    screen.x + 24 * s,
    adHeaderY + 4 + adHeaderH / 2,
    15.5 * s,
    clientName,
    clientAvatarUrl,
    loadImageFromUrl
  );

  const safeName = fitText(clientName || "brand", 18);
  ctx.fillStyle = "#1f1f1f";
  ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
  const nameX = screen.x + 47 * s;
  const nameY = adHeaderY + 27 * s;
  ctx.fillText(safeName, nameX, nameY);

  if (clientVerified) {
    const badgeSize = 10 * s;
    const nameW = ctx.measureText(safeName).width;
    drawVerifiedBadge(ctx, nameX + nameW + 4 * s, nameY - 9 * s, badgeSize);
  }

  ctx.fillStyle = "#1f1f1f";
  ctx.font = `500 ${11 * s}px ${FONT_STACK}`;
  ctx.fillText("Ad", screen.x + 47 * s, adHeaderY + 42 * s);

  drawMoreIcon(ctx, screen.x + screen.w - 25 * s, adHeaderY + 29 * s, 2.1 * s, "#9a9a9a");

  const mediaY = adHeaderY + adHeaderH;
  const ctaH = 36 * s;
  const actionsH = 40 * s;
  const captionH = 58 * s;
  const mediaMaxH = Math.max(130 * s, screen.y + screen.h - navH - ctaH - actionsH - captionH - mediaY);
  const mediaTargetH = mediaHeightForAspect(screen.w, mediaAspect);
  const mediaH = Math.min(mediaTargetH, mediaMaxH);
  const mediaRect = { x: screen.x, y: mediaY, w: screen.w, h: mediaH };

  await drawFeedMedia(args, mediaRect);

  const ctaY = mediaRect.y + mediaRect.h;
  ctx.fillStyle = ctaBgColor;
  ctx.fillRect(screen.x, ctaY - 13, screen.w, ctaH);
  ctx.fillStyle = ctaTextColor;
  ctx.font = `700 ${13 * s}px ${FONT_STACK}`;
  ctx.fillText(fitText(cta || "Learn More", 18), screen.x + 16 * s, ctaY + 14 * s);
  ctx.fillText("›", screen.x + screen.w - 24 * s, ctaY + 13 * s);

  const actionsY = ctaY + ctaH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, actionsY, screen.w, actionsH);

  if (heartIcon) drawTintedImage(ctx, heartIcon, { x: screen.x + 8 * s, y: actionsY + 0 * s, w: 29 * s, h: 29 * s }, "#111");
  if (commentIcon) drawTintedImage(ctx, commentIcon, { x: screen.x + 63 * s, y: actionsY + 0 * s, w: 28 * s, h: 28 * s }, "#111");
  if (sendIcon) drawTintedImage(ctx, sendIcon, { x: screen.x + 110 * s, y: actionsY - 1 * s, w: 29 * s, h: 29 * s }, "#111");
  if (bookmarkIcon) {
    drawTintedImage(
      ctx,
      bookmarkIcon,
      { x: screen.x + screen.w - 38 * s, y: actionsY + 0 * s, w: 29 * s, h: 29 * s },
      "#111"
    );
  }

  ctx.fillStyle = "#2b2b2b";
  ctx.font = `700 ${12.5 * s}px ${FONT_STACK}`;
  ctx.fillText("86", screen.x + 38 * s, actionsY + 19 * s);
  ctx.fillText("11", screen.x + 92 * s, actionsY + 19 * s);
  ctx.fillText("3", screen.x + 141 * s, actionsY + 19 * s);

  const captionY = actionsY + actionsH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, captionY, screen.w, captionH);

  drawCaptionBlock(ctx, {
    x: screen.x + 14 * s,
    y: captionY + 8 * s,
    maxWidth: screen.w - 28 * s,
    maxLines: 3,
    lineHeight: 15 * s,
    username: safeName,
    body: primaryText || "Write some post copy.",
    scale: s,
  });



  const navY = screen.y + screen.h - navH;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screen.x, navY, screen.w, navH);
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(screen.x, navY, screen.w, 1 * s);

  const navIcons = [navHome, navReels, navSend, navSearch, navProfile];
  const navStep = screen.w / navIcons.length;
  navIcons.forEach((icon, index) => {
    if (!icon) return;
    drawTintedImage(
      ctx,
      icon,
      {
        x: screen.x + navStep * index + (navStep - 24 * s) / 2,
        y: navY + (navH - 64 * s) / 2,
        w: 28 * s,
        h: 28 * s,
      },
      index === 0 ? "#111111" : "#1f1f1f"
    );
  });

  endClip(ctx);
}
