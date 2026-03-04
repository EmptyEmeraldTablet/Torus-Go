import { PlaceRequest, RenderMetrics } from "../core/types";
import { DRAG_THRESHOLD_PX } from "../core/constants";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  accumX: number;
  accumY: number;
};

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private onMove: (dr: number, dc: number) => void;
  private onPlace: (placement: PlaceRequest) => void;
  private getMetrics: () => RenderMetrics;
  private drag: DragState | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    onMove: (dr: number, dc: number) => void,
    onPlace: (placement: PlaceRequest) => void,
    getMetrics: () => RenderMetrics,
  ) {
    this.canvas = canvas;
    this.onMove = onMove;
    this.onPlace = onPlace;
    this.getMetrics = getMetrics;
    this.attachEvents();
  }

  private attachEvents() {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("contextmenu", (event) =>
      event.preventDefault(),
    );
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const { x, y } = this.getPointerPosition(event);
    this.drag = {
      pointerId: event.pointerId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      moved: false,
      accumX: 0,
      accumY: 0,
    };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const { x, y } = this.getPointerPosition(event);
    const totalDx = x - this.drag.startX;
    const totalDy = y - this.drag.startY;
    const stepDx = x - this.drag.lastX;
    const stepDy = y - this.drag.lastY;

    if (!this.drag.moved) {
      if (
        Math.abs(totalDx) > DRAG_THRESHOLD_PX ||
        Math.abs(totalDy) > DRAG_THRESHOLD_PX
      ) {
        this.drag.moved = true;
        this.drag.accumX = totalDx;
        this.drag.accumY = totalDy;
      }
    } else {
      this.drag.accumX += stepDx;
      this.drag.accumY += stepDy;
    }

    if (this.drag.moved) {
      const { cellSize } = this.getMetrics();
      const moveCols = -Math.trunc(this.drag.accumX / cellSize);
      const moveRows = -Math.trunc(this.drag.accumY / cellSize);
      if (moveRows !== 0 || moveCols !== 0) {
        this.onMove(moveRows, moveCols);
        this.drag.accumX += moveCols * cellSize;
        this.drag.accumY += moveRows * cellSize;
      }
    }

    this.drag.lastX = x;
    this.drag.lastY = y;
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const { x, y } = this.getPointerPosition(event);
    const totalDx = x - this.drag.startX;
    const totalDy = y - this.drag.startY;
    const wasClick =
      !this.drag.moved &&
      Math.abs(totalDx) <= DRAG_THRESHOLD_PX &&
      Math.abs(totalDy) <= DRAG_THRESHOLD_PX;

    if (wasClick) {
      const coord = this.screenToGrid(x, y);
      if (coord) {
        this.onPlace(coord);
      }
    }

    this.drag = null;
    this.canvas.releasePointerCapture(event.pointerId);
  };

  private handlePointerCancel = (event: PointerEvent) => {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
    }
  };

  private getPointerPosition(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private screenToGrid(x: number, y: number): PlaceRequest | null {
    const { boardX, boardY, cellSize, rows, cols } = this.getMetrics();
    const rawCol = Math.round((x - boardX) / cellSize);
    const rawRow = Math.round((y - boardY) / cellSize);
    if (
      rawRow < 0 ||
      rawRow > rows - 1 ||
      rawCol < 0 ||
      rawCol > cols - 1
    ) {
      return null;
    }
    const row = rawRow;
    const col = rawCol;
    const targetX = boardX + rawCol * cellSize;
    const targetY = boardY + rawRow * cellSize;
    const distance = Math.hypot(x - targetX, y - targetY);
    if (distance > cellSize * 0.6) {
      return null;
    }
    return {
      coord: { row, col },
      rawRow,
      rawCol,
    };
  }
}
