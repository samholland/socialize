import { FONT_STACK } from "../constants";
import { fillRoundedRect, fitText } from "../utils";
import {
  clipScreen,
  drawAvatarCircle,
  drawFeedMedia,
  drawMoreIcon,
  drawVerifiedBadge,
  drawWrappedText,
  endClip,
  mediaHeightForAspect,
} from "./shared";
import type { DrawFeedSurfaceArgs } from "./types";

function drawTopBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, s: number) {
  const topH = 46 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, topH);

  ctx.fillStyle = "#1877f2";
  ctx.font = `700 ${14 * s}px ${FONT_STACK}`;
  ctx.fillText("facebook", x + 14 * s, y + 29 * s);

  const iconY = y + topH / 2;
  const iconSize = 14 * s;
  for (let i = 0; i < 3; i += 1) {
    const cx = x + w - (19 + i * 22) * s;
    ctx.fillStyle = "#f0f2f5";
    ctx.beginPath();
    ctx.arc(cx, iconY, 9 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#202124";
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.beginPath();
    if (i === 0) {
      ctx.moveTo(cx - iconSize * 0.2, iconY);
      ctx.lineTo(cx + iconSize * 0.2, iconY);
      ctx.moveTo(cx, iconY - iconSize * 0.2);
      ctx.lineTo(cx, iconY + iconSize * 0.2);
    } else if (i === 1) {
      ctx.arc(cx - 1 * s, iconY - 1 * s, 3.2 * s, 0, Math.PI * 2);
      ctx.moveTo(cx + 3 * s, iconY + 3 * s);
      ctx.lineTo(cx + 6 * s, iconY + 6 * s);
    } else {
      fillRoundedRect(ctx, { x: cx - 5 * s, y: iconY - 3.8 * s, w: 10 * s, h: 8 * s }, 2 * s);
      ctx.fillStyle = "#f0f2f5";
      ctx.beginPath();
      ctx.moveTo(cx - 1 * s, iconY + 4 * s);
      ctx.lineTo(cx + 2 * s, iconY + 3 * s);
      ctx.lineTo(cx + 0 * s, iconY + 1 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#202124";
      ctx.beginPath();
      ctx.rect(cx - 4 * s, iconY - 2.6 * s, 8 * s, 5.2 * s);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(x, y + topH - 1 * s, w, 1 * s);
}

function drawTabBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, s: number) {
  const tabH = 34 * s;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, tabH);

  const labels = ["Home", "Reels", "Friends", "Groups", "Notifs"];
  const step = w / labels.length;
  labels.forEach((label, i) => {
    const cx = x + step * (i + 0.5);
    const active = i === 0;
    ctx.fillStyle = active ? "#1877f2" : "#65676b";
    ctx.font = `${active ? 700 : 500} ${7.2 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, y + 22 * s);
    if (active) {
      ctx.fillRect(cx - 16 * s, y + tabH - 2 * s, 32 * s, 2 * s);
    }
  });
  ctx.textAlign = "left";

  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(x, y + tabH - 1 * s, w, 1 * s);
}

function drawBottomNav(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(x, y, w, 1 * s);

  const step = w / 5;
  for (let i = 0; i < 5; i += 1) {
    const cx = x + step * (i + 0.5);
    ctx.fillStyle = i === 0 ? "#1877f2" : "#65676b";
    ctx.beginPath();
    ctx.arc(cx, y + h / 2, 6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function drawFacebookFeedSurface(args: DrawFeedSurfaceArgs) {
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

  const s = layout.scale;
  const screen = layout.screen;
  const navH = 44 * s;

  clipScreen(ctx, layout);

  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);

  drawTopBar(ctx, screen.x, screen.y, screen.w, s);
  drawTabBar(ctx, screen.x, screen.y + 46 * s, screen.w, s);

  const cardX = screen.x + 8 * s;
  const cardW = screen.w - 16 * s;
  const contentTop = screen.y + 86 * s;

  ctx.fillStyle = "#ffffff";
  fillRoundedRect(
    ctx,
    {
      x: cardX,
      y: contentTop,
      w: cardW,
      h: screen.h - (contentTop - screen.y) - navH - 10 * s,
    },
    7 * s
  );

  const headerY = contentTop + 14 * s;
  await drawAvatarCircle(
    ctx,
    cardX + 16 * s,
    headerY + 10 * s,
    10 * s,
    clientName,
    clientAvatarUrl,
    loadImageFromUrl
  );

  const displayName = fitText(clientName || "Brand", 24);
  const nameX = cardX + 32 * s;
  const nameY = headerY + 8 * s;
  ctx.fillStyle = "#1d2129";
  ctx.font = `700 ${8.4 * s}px ${FONT_STACK}`;
  ctx.fillText(displayName, nameX, nameY);

  if (clientVerified) {
    const nameW = ctx.measureText(displayName).width;
    drawVerifiedBadge(ctx, nameX + nameW + 3 * s, nameY - 6.5 * s, 7 * s);
  }

  ctx.fillStyle = "#65676b";
  ctx.font = `500 ${7 * s}px ${FONT_STACK}`;
  ctx.fillText("Sponsored · Public", nameX, headerY + 18 * s);

  drawMoreIcon(ctx, cardX + cardW - 20 * s, headerY + 10 * s, 1.5 * s, "#8a8d91");

  let y = headerY + 28 * s;

  if (primaryText.trim()) {
    ctx.fillStyle = "#1d2129";
    ctx.font = `500 ${8 * s}px ${FONT_STACK}`;
    drawWrappedText(
      ctx,
      primaryText,
      cardX + 8 * s,
      y,
      cardW - 16 * s,
      3,
      12 * s
    );
    y += 38 * s;
  }

  const footerH = navH + 80 * s;
  const mediaMaxH = Math.max(120 * s, screen.y + screen.h - footerH - y - 4 * s);
  const mediaTargetH = mediaHeightForAspect(cardW, mediaAspect);
  const mediaH = Math.min(mediaMaxH, mediaTargetH);
  const mediaRect = { x: cardX, y, w: cardW, h: mediaH };

  await drawFeedMedia(args, mediaRect, "Drop media");

  y += mediaH;

  const ctaH = 42 * s;
  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(cardX, y, cardW, ctaH);

  ctx.fillStyle = "#65676b";
  ctx.font = `600 ${6.4 * s}px ${FONT_STACK}`;
  const domain = `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand"}.com`;
  ctx.fillText(domain, cardX + 8 * s, y + 14 * s);

  ctx.fillStyle = "#1d2129";
  ctx.font = `700 ${7.6 * s}px ${FONT_STACK}`;
  ctx.fillText(fitText(primaryText || displayName, 34), cardX + 8 * s, y + 27 * s);

  const btnW = Math.max(72 * s, ctx.measureText(cta || "Learn More").width + 20 * s);
  const btnH = 18 * s;
  const btnX = cardX + cardW - btnW - 8 * s;
  const btnY = y + (ctaH - btnH) / 2;
  ctx.fillStyle = ctaBgColor;
  fillRoundedRect(ctx, { x: btnX, y: btnY, w: btnW, h: btnH }, 5 * s);

  ctx.fillStyle = ctaTextColor;
  ctx.font = `700 ${7.2 * s}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(fitText(cta || "Learn More", 14), btnX + btnW / 2, btnY + 9 * s);
  ctx.textAlign = "left";

  y += ctaH;

  ctx.fillStyle = "#65676b";
  ctx.font = `500 ${7 * s}px ${FONT_STACK}`;
  ctx.fillText("👍 2.1K   ·   48 comments", cardX + 8 * s, y + 15 * s);

  y += 22 * s;

  ctx.fillStyle = "#e6e8ec";
  ctx.fillRect(cardX + 8 * s, y, cardW - 16 * s, 1 * s);
  y += 1 * s;

  const actionLabels = ["Like", "Comment", "Share"];
  const actionStep = cardW / actionLabels.length;
  actionLabels.forEach((label, index) => {
    const left = cardX + actionStep * index;
    ctx.fillStyle = "#1d2129";
    ctx.font = `600 ${7.4 * s}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(label, left + actionStep / 2, y + 16 * s);
  });
  ctx.textAlign = "left";

  drawBottomNav(ctx, screen.x, screen.y + screen.h - navH, screen.w, navH, s);

  endClip(ctx);
}
