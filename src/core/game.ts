import {
  createBoard,
  createEmptyFlagGrid,
  createEmptyGrid,
} from "./board";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MIN_BOARD_SIZE,
} from "./constants";
import {
  BoardState,
  Coord,
  GameResult,
  GameLoadRecord,
  MoveRecord,
  PlaceRequest,
  PlayerColor,
} from "./types";
import type { Player } from "./types";
import { mod } from "../utils/math";
import { CameraController } from "../interaction/camera";
import { Renderer } from "../rendering/renderer";
import { InputHandler } from "../interaction/input";

type GameOptions = {
  rows?: number;
  cols?: number;
  onStateChange?: (board: BoardState) => void;
};

type GroupInfo = {
  stones: Coord[];
  liberties: Set<string>;
};

const OPPONENT: Record<PlayerColor, PlayerColor> = {
  black: "white",
  white: "black",
};

export class Game {
  private board: BoardState;
  private camera: CameraController;
  private renderer: Renderer;
  private input: InputHandler;
  private onStateChange?: (board: BoardState) => void;
  private rafHandle = 0;
  private humanPlayer: PlayerColor | "both" | "none" = "both";

  constructor(canvas: HTMLCanvasElement, options: GameOptions = {}) {
    const rows = options.rows ?? DEFAULT_ROWS;
    const cols = options.cols ?? DEFAULT_COLS;
    this.board = createBoard(rows, cols);
    this.camera = new CameraController(rows, cols);
    this.renderer = new Renderer(canvas, rows, cols);
    this.onStateChange = options.onStateChange;
    this.input = new InputHandler(
      canvas,
      this.onMove,
      this.onPlace,
      () => this.renderer.getMetrics(),
    );
    this.notifyState();
    this.render();
  }

  resize() {
    this.renderer.resize();
    this.render();
  }

  reset() {
    this.board.grid = createEmptyGrid(this.board.rows, this.board.cols);
    this.board.deadMap = createEmptyFlagGrid(
      this.board.rows,
      this.board.cols,
    );
    this.board.currentPlayer = "black";
    this.board.moveHistory = [];
    this.board.koPoint = null;
    this.board.consecutivePasses = 0;
    this.board.captures = { black: 0, white: 0 };
    this.board.result = null;
    this.board.phase = "play";
    this.camera.reset();
    this.notifyState();
    this.render();
  }

  undo() {
    if (this.board.moveHistory.length === 0) return;
    const last = this.board.moveHistory.pop();
    if (!last) return;

    this.board.result = null;
    this.board.koPoint = last.prevKo;
    this.board.consecutivePasses = last.prevPasses;
    this.board.currentPlayer = last.player;
    this.board.phase = "play";
    this.clearDeadMap();

    if (last.coord) {
      const { row, col } = last.coord;
      this.board.grid[row][col] = null;
      const opponent = OPPONENT[last.player];
      for (const stone of last.captured) {
        this.board.grid[stone.row][stone.col] = opponent;
      }
      this.board.captures[last.player] -= last.captured.length;
    }

    if (this.board.consecutivePasses >= 2) {
      this.enterScoringPhase();
    }

    this.notifyState();
    this.render();
  }

  pass() {
    if (this.board.phase !== "play") return;
    this.passInternal(false, true);
  }

  resumePlay() {
    if (this.board.phase !== "scoring") return;
    this.clearDeadMap();
    this.board.phase = "play";
    this.board.result = null;
    this.board.consecutivePasses = 0;
    this.board.koPoint = null;
    while (
      this.board.moveHistory.length > 0 &&
      this.board.moveHistory[this.board.moveHistory.length - 1].coord === null
    ) {
      this.board.moveHistory.pop();
    }
    this.notifyState();
    this.render();
  }

  setBoardSize(rows: number, cols: number) {
    const nextRows = Math.max(MIN_BOARD_SIZE, Math.floor(rows));
    const nextCols = Math.max(MIN_BOARD_SIZE, Math.floor(cols));
    const nextBoard = createBoard(nextRows, nextCols);
    nextBoard.rules = { ...this.board.rules };
    this.board = nextBoard;
    this.camera = new CameraController(nextRows, nextCols);
    this.renderer.setBoardSize(nextRows, nextCols);
    this.notifyState();
    this.render();
  }

  setHumanPlayer(player: PlayerColor | "both" | "none") {
    this.humanPlayer = player;
  }

  loadRecord(record: GameLoadRecord) {
    const sameSize =
      record.rows === this.board.rows && record.cols === this.board.cols;
    if (!sameSize) {
      const nextBoard = createBoard(record.rows, record.cols);
      nextBoard.rules = { ...this.board.rules };
      this.board = nextBoard;
      this.camera = new CameraController(record.rows, record.cols);
      this.renderer.setBoardSize(record.rows, record.cols);
    }
    this.board.grid = createEmptyGrid(record.rows, record.cols);
    this.board.deadMap = createEmptyFlagGrid(
      record.rows,
      record.cols,
    );
    this.board.currentPlayer = record.nextPlayer ?? "black";
    this.board.moveHistory = [];
    this.board.koPoint = null;
    this.board.consecutivePasses = 0;
    this.board.captures = { black: 0, white: 0 };
    this.board.result = null;
    this.board.phase = "play";
    this.board.rules = {
      ...this.board.rules,
      komi: record.komi ?? this.board.rules.komi,
    };
    this.camera.reset();

    for (const coord of record.setup.black) {
      this.board.grid[coord.row][coord.col] = "black";
    }
    for (const coord of record.setup.white) {
      this.board.grid[coord.row][coord.col] = "white";
    }
    for (const coord of record.setup.empty) {
      this.board.grid[coord.row][coord.col] = null;
    }

    for (const move of record.moves) {
      this.board.currentPlayer = move.player;
      if (move.coord) {
        this.placeAtBoardCoord(move.coord, true);
      } else {
        this.passInternal(true, false);
      }
    }

    if (record.moves.length === 0 && record.nextPlayer) {
      this.board.currentPlayer = record.nextPlayer;
    }

    if (this.board.consecutivePasses >= 2) {
      this.enterScoringPhase();
    }

    this.notifyState();
    this.render();
  }

  moveView(dr: number, dc: number) {
    this.camera.move(dr, dc);
    this.render();
  }

  resetView() {
    this.camera.reset();
    this.render();
  }

  playAt(coord: Coord): boolean {
    if (this.board.phase !== "play") return false;
    return this.placeAtBoardCoord(coord);
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange(this.board);
    }
  }

  private onMove = (dr: number, dc: number) => {
    this.camera.move(dr, dc);
    this.render();
  };

  private onPlace = (placement: PlaceRequest) => {
    const gridCoord = placement.coord;
    const r = mod(
      gridCoord.row + this.camera.offsetRow,
      this.board.rows,
    );
    const c = mod(
      gridCoord.col + this.camera.offsetCol,
      this.board.cols,
    );

    if (this.board.phase === "scoring") {
      this.toggleDeadGroup({ row: r, col: c });
      this.board.result = this.computeResult();
      this.notifyState();
      this.render();
      return;
    }

    if (this.humanPlayer === "none") {
      return;
    }
    if (
      this.humanPlayer !== "both" &&
      this.board.currentPlayer !== this.humanPlayer
    ) {
      return;
    }

    this.placeAtBoardCoord({ row: r, col: c });
  };

  private passInternal(silent: boolean, allowScoring: boolean) {
    const player = this.board.currentPlayer;
    const record: MoveRecord = {
      player,
      coord: null,
      captured: [],
      prevKo: this.board.koPoint,
      prevPasses: this.board.consecutivePasses,
    };

    this.board.koPoint = null;
    this.board.consecutivePasses += 1;
    this.board.moveHistory.push(record);
    this.board.currentPlayer = OPPONENT[player];

    if (allowScoring && this.board.consecutivePasses >= 2) {
      this.enterScoringPhase();
    }

    if (!silent) {
      this.notifyState();
      this.render();
    }
  }

  private placeAtBoardCoord(coord: Coord, silent = false): boolean {
    if (this.board.result) return false;
    const { row: r, col: c } = coord;
    if (this.board.grid[r][c] !== null) return false;
    if (
      this.board.rules.koRule === "simple" &&
      this.board.koPoint &&
      this.isSameCoord(this.board.koPoint, r, c)
    ) {
      return false;
    }

    const placedPlayer = this.board.currentPlayer;
    const opponent = OPPONENT[placedPlayer];
    this.board.grid[r][c] = placedPlayer;

    const captured = this.collectCaptures({ row: r, col: c }, opponent);
    if (captured.length > 0) {
      for (const stone of captured) {
        this.board.grid[stone.row][stone.col] = null;
      }
    }

    const myGroup = this.collectGroup({ row: r, col: c });
    if (myGroup.liberties.size === 0 && !this.board.rules.allowSuicide) {
      this.board.grid[r][c] = null;
      for (const stone of captured) {
        this.board.grid[stone.row][stone.col] = opponent;
      }
      return false;
    }

    const prevKo = this.board.koPoint;
    const prevPasses = this.board.consecutivePasses;
    this.board.consecutivePasses = 0;
    this.board.captures[placedPlayer] += captured.length;
    this.board.koPoint = this.getKoPoint(captured, myGroup);
    this.board.moveHistory.push({
      player: placedPlayer,
      coord: { row: r, col: c },
      captured,
      prevKo,
      prevPasses,
    });
    this.board.currentPlayer = opponent;
    this.clearDeadMap();
    if (!silent) {
      this.notifyState();
      this.render();
    }
    return true;
  }

  private collectCaptures(origin: Coord, opponent: PlayerColor): Coord[] {
    const captured: Coord[] = [];
    const checked = new Set<string>();

    for (const neighbor of this.getNeighbors(origin.row, origin.col)) {
      if (this.board.grid[neighbor.row][neighbor.col] !== opponent) continue;
      const key = this.coordKey(neighbor.row, neighbor.col);
      if (checked.has(key)) continue;
      const group = this.collectGroup(neighbor);
      for (const stone of group.stones) {
        checked.add(this.coordKey(stone.row, stone.col));
      }
      if (group.liberties.size === 0) {
        captured.push(...group.stones);
      }
    }

    return captured;
  }

  private collectGroup(start: Coord): GroupInfo {
    const color = this.board.grid[start.row][start.col];
    if (!color) {
      return { stones: [], liberties: new Set<string>() };
    }

    const stones: Coord[] = [];
    const liberties = new Set<string>();
    const visited = new Set<string>();
    const stack: Coord[] = [start];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      const key = this.coordKey(current.row, current.col);
      if (visited.has(key)) continue;
      visited.add(key);
      stones.push(current);

      for (const neighbor of this.getNeighbors(current.row, current.col)) {
        const cell = this.board.grid[neighbor.row][neighbor.col];
        if (cell === null) {
          liberties.add(this.coordKey(neighbor.row, neighbor.col));
        } else if (cell === color) {
          stack.push(neighbor);
        }
      }
    }

    return { stones, liberties };
  }

  private getKoPoint(
    captured: Coord[],
    group: GroupInfo,
  ): Coord | null {
    if (captured.length !== 1) return null;
    if (group.liberties.size !== 1) return null;
    const [libertyKey] = group.liberties;
    if (!libertyKey) return null;
    const [libRow, libCol] = libertyKey.split(",").map(Number);
    const onlyCaptured = captured[0];
    if (
      libRow === onlyCaptured.row &&
      libCol === onlyCaptured.col
    ) {
      return { row: libRow, col: libCol };
    }
    return null;
  }

  private toggleDeadGroup(target: Coord) {
    const color = this.board.grid[target.row][target.col];
    if (!color) return;
    const group = this.collectGroup(target);
    if (group.stones.length === 0) return;
    const shouldMarkDead = group.stones.some(
      (stone) => !this.board.deadMap[stone.row][stone.col],
    );
    for (const stone of group.stones) {
      this.board.deadMap[stone.row][stone.col] = shouldMarkDead;
    }
  }

  private computeResult(): GameResult {
    const visited = new Set<string>();
    let blackScore = 0;
    let whiteScore = 0;

    for (let r = 0; r < this.board.rows; r += 1) {
      for (let c = 0; c < this.board.cols; c += 1) {
        const cell = this.getScoringCell(r, c);
        if (cell === "black") {
          blackScore += 1;
          continue;
        }
        if (cell === "white") {
          whiteScore += 1;
          continue;
        }

        const key = this.coordKey(r, c);
        if (visited.has(key)) continue;

        const region = this.collectEmptyRegion({ row: r, col: c }, visited);
        if (region.bordering.size === 1) {
          const [owner] = region.bordering;
          if (owner === "black") blackScore += region.size;
          if (owner === "white") whiteScore += region.size;
        }
      }
    }

    whiteScore += this.board.rules.komi;
    const winner =
      blackScore > whiteScore
        ? "black"
        : whiteScore > blackScore
          ? "white"
          : "draw";
    return { black: blackScore, white: whiteScore, winner };
  }

  private collectEmptyRegion(
    start: Coord,
    visited: Set<string>,
  ): { size: number; bordering: Set<PlayerColor> } {
    const bordering = new Set<PlayerColor>();
    const stack: Coord[] = [start];
    let size = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      const key = this.coordKey(current.row, current.col);
      if (visited.has(key)) continue;
      visited.add(key);

      if (this.getScoringCell(current.row, current.col) !== null) {
        continue;
      }

      size += 1;
      for (const neighbor of this.getNeighbors(current.row, current.col)) {
        const cell = this.getScoringCell(neighbor.row, neighbor.col);
        if (cell === null) {
          stack.push(neighbor);
        } else {
          bordering.add(cell);
        }
      }
    }

    return { size, bordering };
  }

  private getScoringCell(row: number, col: number): Player {
    if (this.board.deadMap[row]?.[col]) return null;
    return this.board.grid[row][col];
  }

  private getNeighbors(row: number, col: number): Coord[] {
    return [
      { row: mod(row - 1, this.board.rows), col },
      { row: mod(row + 1, this.board.rows), col },
      { row, col: mod(col - 1, this.board.cols) },
      { row, col: mod(col + 1, this.board.cols) },
    ];
  }

  private coordKey(row: number, col: number): string {
    return `${row},${col}`;
  }

  private isSameCoord(coord: Coord, row: number, col: number): boolean {
    return coord.row === row && coord.col === col;
  }

  private clearDeadMap() {
    this.board.deadMap = createEmptyFlagGrid(
      this.board.rows,
      this.board.cols,
    );
  }

  private enterScoringPhase() {
    this.board.phase = "scoring";
    this.clearDeadMap();
    this.board.result = this.computeResult();
  }

  private render() {
    if (this.rafHandle) return;
    this.rafHandle = window.requestAnimationFrame(() => {
      this.rafHandle = 0;
      this.renderer.draw(this.board, this.camera);
    });
  }
}
