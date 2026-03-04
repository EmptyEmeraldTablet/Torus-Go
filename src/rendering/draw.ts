import { PlayerColor } from "../core/types";

export function drawStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  player: PlayerColor,
) {
  const gradient = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.2,
    x,
    y,
    radius,
  );
  if (player === "black") {
    gradient.addColorStop(0, "#4a4a4a");
    gradient.addColorStop(0.5, "#1c1c1c");
    gradient.addColorStop(1, "#000000");
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.6, "#f0e9df");
    gradient.addColorStop(1, "#c9bfb2");
  }

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (player === "white") {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = Math.max(1, radius * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  lineWidth: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawCornerDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  filled: boolean,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = "rgba(46, 32, 18, 0.8)";
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(46, 32, 18, 0.5)";
    ctx.lineWidth = Math.max(1, radius * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawDeadMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  const size = radius * 0.75;
  ctx.save();
  ctx.strokeStyle = "rgba(196, 80, 60, 0.8)";
  ctx.lineWidth = Math.max(1, radius * 0.18);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x - size, y + size);
  ctx.lineTo(x + size, y - size);
  ctx.stroke();
  ctx.restore();
}
