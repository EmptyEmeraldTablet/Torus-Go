import { BoardState, RenderMetrics } from "../core/types";
import { MIN_CELL_PX, MAX_CELL_PX } from "../core/constants";
import { mod } from "../utils/math";
import { Camera } from "../interaction/camera";
import { drawCornerDot, drawDeadMarker, drawRing, drawStone } from "./draw";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rows: number;
  private cols: number;
  private metrics: RenderMetrics;

  constructor(canvas: HTMLCanvasElement, rows: number, cols: number) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable.");
    }
    this.canvas = canvas;
    this.ctx = context;
    this.rows = rows;
    this.cols = cols;
    this.metrics = {
      boardX: 0,
      boardY: 0,
      boardWidth: 0,
      boardHeight: 0,
      cellSize: 0,
      rows,
      cols,
    };
    this.resize();
  }

  getMetrics(): RenderMetrics {
    return this.metrics;
  }

  setBoardSize(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gridCols = Math.max(this.cols - 1, 1);
    const gridRows = Math.max(this.rows - 1, 1);
    const padding = Math.max(20, Math.min(rect.width, rect.height) * 0.06);
    const maxCell = Math.min(
      (rect.width - padding * 2) / gridCols,
      (rect.height - padding * 2) / gridRows,
    );
    let cellSize = Math.floor(Math.min(maxCell, MAX_CELL_PX));
    if (cellSize < MIN_CELL_PX) {
      cellSize = Math.max(8, Math.floor(maxCell));
    }

    const boardWidth = cellSize * gridCols;
    const boardHeight = cellSize * gridRows;
    const boardX = (rect.width - boardWidth) / 2;
    const boardY = (rect.height - boardHeight) / 2;

    this.metrics = {
      boardX,
      boardY,
      boardWidth,
      boardHeight,
      cellSize,
      rows: this.rows,
      cols: this.cols,
    };
  }

  draw(board: BoardState, camera: Camera) {
    this.clear();
    this.drawBoardBase();
    this.drawGrid();
    this.drawBoundaryHint();
    this.drawStarPoints();
    this.drawPieces(board, camera);
    this.drawLastMove(board, camera);
    this.drawBoundaryArrows();
  }

  private clear() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
  }

  private drawBoardBase() {
    const { boardX, boardY, boardWidth, boardHeight } = this.metrics;
    this.ctx.save();
    this.ctx.fillStyle = "rgba(248, 239, 228, 0.7)";
    this.ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
    this.ctx.restore();
  }

  private drawBoundaryHint() {
    const { boardX, boardY, boardWidth, boardHeight, cellSize } = this.metrics;
    const band = Math.max(6, cellSize * 0.18);
    this.ctx.save();
    this.ctx.fillStyle = "rgba(196, 106, 58, 0.06)";
    this.ctx.fillRect(
      boardX,
      boardY + boardHeight - band,
      boardWidth,
      band,
    );
    this.ctx.fillRect(
      boardX + boardWidth - band,
      boardY,
      band,
      boardHeight,
    );
    this.ctx.fillStyle = "rgba(196, 106, 58, 0.1)";
    this.ctx.fillRect(
      boardX + boardWidth - band,
      boardY + boardHeight - band,
      band,
      band,
    );
    this.ctx.restore();
  }

  private drawGrid() {
    const { boardX, boardY, boardWidth, boardHeight, cellSize } = this.metrics;
    const ctx = this.ctx;
    const innerColor = "rgba(154, 135, 119, 0.55)";
    const boundaryColor = "rgba(92, 76, 62, 0.7)";

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = innerColor;
    ctx.setLineDash([]);

    for (let r = 1; r < this.rows - 1; r += 1) {
      const y = boardY + r * cellSize;
      ctx.beginPath();
      ctx.moveTo(boardX, y);
      ctx.lineTo(boardX + boardWidth, y);
      ctx.stroke();
    }

    for (let c = 1; c < this.cols - 1; c += 1) {
      const x = boardX + c * cellSize;
      ctx.beginPath();
      ctx.moveTo(x, boardY);
      ctx.lineTo(x, boardY + boardHeight);
      ctx.stroke();
    }

    ctx.strokeStyle = boundaryColor;
    ctx.lineWidth = 2;

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(boardX, boardY);
    ctx.lineTo(boardX + boardWidth, boardY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(boardX, boardY);
    ctx.lineTo(boardX, boardY + boardHeight);
    ctx.stroke();

    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + boardHeight);
    ctx.lineTo(boardX + boardWidth, boardY + boardHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(boardX + boardWidth, boardY);
    ctx.lineTo(boardX + boardWidth, boardY + boardHeight);
    ctx.stroke();

    ctx.restore();
  }

  private drawStarPoints() {
    if (this.rows !== this.cols) return;
    const size = this.rows;
    let points: Array<[number, number]> = [];

    if (size === 9) {
      points = [
        [2, 2],
        [2, 6],
        [4, 4],
        [6, 2],
        [6, 6],
      ];
    } else if (size === 13 || size === 19) {
      const mid = Math.floor(size / 2);
      const edge = 3;
      const max = size - 4;
      const coords = [edge, mid, max];
      points = coords.flatMap((r) => coords.map((c) => [r, c]));
    }

    if (points.length === 0) return;
    const { boardX, boardY, cellSize } = this.metrics;
    const radius = Math.max(2, cellSize * 0.08);
    this.ctx.save();
    this.ctx.fillStyle = "rgba(76, 60, 46, 0.65)";
    for (const [r, c] of points) {
      const x = boardX + c * cellSize;
      const y = boardY + r * cellSize;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  private drawPieces(board: BoardState, camera: Camera) {
    const { boardX, boardY, cellSize } = this.metrics;
    const radius = cellSize * 0.44;
    for (let r = 0; r < board.rows; r += 1) {
      for (let c = 0; c < board.cols; c += 1) {
        const player = board.grid[r][c];
        if (!player) continue;
        const isDead = board.deadMap[r]?.[c] ?? false;
        const gridR = mod(r - camera.offsetRow, board.rows);
        const gridC = mod(c - camera.offsetCol, board.cols);
        const x = boardX + gridC * cellSize;
        const y = boardY + gridR * cellSize;
        if (isDead) {
          this.ctx.save();
          this.ctx.globalAlpha = 0.35;
          drawStone(this.ctx, x, y, radius, player);
          this.ctx.restore();
          drawDeadMarker(this.ctx, x, y, radius);
        } else {
          drawStone(this.ctx, x, y, radius, player);
        }
      }
    }
  }

  private drawLastMove(board: BoardState, camera: Camera) {
    if (board.moveHistory.length === 0) return;
    const last = board.moveHistory[board.moveHistory.length - 1];
    if (!last.coord) return;
    const { boardX, boardY, cellSize } = this.metrics;
    const gridR = mod(last.coord.row - camera.offsetRow, board.rows);
    const gridC = mod(last.coord.col - camera.offsetCol, board.cols);
    const x = boardX + gridC * cellSize;
    const y = boardY + gridR * cellSize;
    drawRing(this.ctx, x, y, cellSize * 0.52, "rgba(196, 106, 58, 0.7)", 2);
  }

  private drawBoundaryArrows() {
    const { boardX, boardY, boardWidth, boardHeight, cellSize } = this.metrics;
    const ctx = this.ctx;
    const margin = Math.max(18, cellSize * 0.6);

    ctx.save();
    ctx.fillStyle = "rgba(76, 60, 46, 0.8)";
    ctx.font = `${Math.round(cellSize * 0.4)}px "Plus Jakarta Sans", "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText("↑ 连接下边", boardX + boardWidth / 2, boardY - margin);
    ctx.fillText(
      "↓ 连接上边",
      boardX + boardWidth / 2,
      boardY + boardHeight + margin,
    );
    ctx.fillText("← 连接右边", boardX - margin, boardY + boardHeight / 2);
    ctx.fillText(
      "→ 连接左边",
      boardX + boardWidth + margin,
      boardY + boardHeight / 2,
    );

    const dotRadius = Math.max(3, cellSize * 0.08);
    drawCornerDot(ctx, boardX, boardY, dotRadius, true);
    drawCornerDot(ctx, boardX + boardWidth, boardY, dotRadius, false);
    drawCornerDot(ctx, boardX, boardY + boardHeight, dotRadius, false);
    drawCornerDot(
      ctx,
      boardX + boardWidth,
      boardY + boardHeight,
      dotRadius,
      false,
    );

    ctx.restore();
  }
}
