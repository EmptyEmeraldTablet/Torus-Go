import { BoardState, Coord, PlayerColor } from "../core/types";
import { mod } from "../utils/math";

export type AiDecision =
  | { type: "play"; coord: Coord }
  | { type: "pass" };

type SimResult = {
  legal: boolean;
  captureCount: number;
  selfLiberties: number;
  selfAtari: boolean;
  oppAtariCount: number;
  adjacentOpp: number;
  adjacentOwn: number;
  fillsEye: boolean;
};

type GroupInfo = {
  stones: Coord[];
  liberties: Set<string>;
};

const OPPONENT: Record<PlayerColor, PlayerColor> = {
  black: "white",
  white: "black",
};

export class SimpleAI {
  chooseMove(board: BoardState): AiDecision {
    const moves: Array<{ coord: Coord; score: number }> = [];
    let occupied = 0;

    for (let r = 0; r < board.rows; r += 1) {
      for (let c = 0; c < board.cols; c += 1) {
        if (board.grid[r][c] !== null) {
          occupied += 1;
          continue;
        }
        const sim = simulateMove(board, { row: r, col: c }, board.currentPlayer);
        if (!sim.legal) continue;
        const score = scoreMove(sim);
        moves.push({ coord: { row: r, col: c }, score });
      }
    }

    if (moves.length === 0) {
      return { type: "pass" };
    }

    let best = moves[0];
    for (let i = 1; i < moves.length; i += 1) {
      if (moves[i].score > best.score) {
        best = moves[i];
      }
    }

    const occupiedRatio = occupied / (board.rows * board.cols);
    if (shouldPass(board, best.score, occupiedRatio)) {
      return { type: "pass" };
    }
    return { type: "play", coord: best.coord };
  }
}

function shouldPass(board: BoardState, score: number, occupiedRatio: number) {
  if (board.consecutivePasses >= 1 && score <= 1) return true;
  if (occupiedRatio > 0.85 && score <= 2) return true;
  return score < -1;
}

function scoreMove(sim: SimResult) {
  let score = 0;
  score += sim.captureCount * 100;
  score += sim.oppAtariCount * 10;
  score += sim.selfLiberties * 2;
  score += sim.adjacentOpp * 1.5;
  score += sim.adjacentOwn * 0.4;
  if (sim.selfAtari) score -= 18;
  if (sim.fillsEye) score -= 8;
  score += Math.random() * 0.4;
  return score;
}

function simulateMove(
  board: BoardState,
  coord: Coord,
  player: PlayerColor,
): SimResult {
  const opponent = OPPONENT[player];
  const result: SimResult = {
    legal: false,
    captureCount: 0,
    selfLiberties: 0,
    selfAtari: false,
    oppAtariCount: 0,
    adjacentOpp: 0,
    adjacentOwn: 0,
    fillsEye: false,
  };

  if (board.grid[coord.row][coord.col] !== null) return result;
  if (
    board.rules.koRule === "simple" &&
    board.koPoint &&
    board.koPoint.row === coord.row &&
    board.koPoint.col === coord.col
  ) {
    return result;
  }

  board.grid[coord.row][coord.col] = player;
  const captured: Coord[] = [];
  const checked = new Set<string>();

  for (const neighbor of getNeighbors(coord.row, coord.col, board.rows, board.cols)) {
    if (board.grid[neighbor.row][neighbor.col] !== opponent) continue;
    const key = coordKey(neighbor.row, neighbor.col);
    if (checked.has(key)) continue;
    const group = collectGroup(board, neighbor);
    for (const stone of group.stones) {
      checked.add(coordKey(stone.row, stone.col));
    }
    if (group.liberties.size === 0) {
      captured.push(...group.stones);
    }
  }

  for (const stone of captured) {
    board.grid[stone.row][stone.col] = null;
  }

  const myGroup = collectGroup(board, coord);
  const selfLiberties = myGroup.liberties.size;
  const legal = selfLiberties > 0 || board.rules.allowSuicide;

  let oppAtariCount = 0;
  const oppChecked = new Set<string>();
  for (const neighbor of getNeighbors(coord.row, coord.col, board.rows, board.cols)) {
    if (board.grid[neighbor.row][neighbor.col] !== opponent) continue;
    const key = coordKey(neighbor.row, neighbor.col);
    if (oppChecked.has(key)) continue;
    const group = collectGroup(board, neighbor);
    for (const stone of group.stones) {
      oppChecked.add(coordKey(stone.row, stone.col));
    }
    if (group.liberties.size === 1) {
      oppAtariCount += 1;
    }
  }

  let adjacentOpp = 0;
  let adjacentOwn = 0;
  let allOwn = true;
  for (const neighbor of getNeighbors(coord.row, coord.col, board.rows, board.cols)) {
    const cell = board.grid[neighbor.row][neighbor.col];
    if (cell === opponent) adjacentOpp += 1;
    if (cell === player) adjacentOwn += 1;
    if (cell !== player) allOwn = false;
  }

  const fillsEye = captured.length === 0 && allOwn;

  board.grid[coord.row][coord.col] = null;
  for (const stone of captured) {
    board.grid[stone.row][stone.col] = opponent;
  }

  result.legal = legal;
  result.captureCount = captured.length;
  result.selfLiberties = selfLiberties;
  result.selfAtari = selfLiberties === 1;
  result.oppAtariCount = oppAtariCount;
  result.adjacentOpp = adjacentOpp;
  result.adjacentOwn = adjacentOwn;
  result.fillsEye = fillsEye;
  return result;
}

function collectGroup(board: BoardState, start: Coord): GroupInfo {
  const color = board.grid[start.row][start.col];
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
    const key = coordKey(current.row, current.col);
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(current);

    for (const neighbor of getNeighbors(current.row, current.col, board.rows, board.cols)) {
      const cell = board.grid[neighbor.row][neighbor.col];
      if (cell === null) {
        liberties.add(coordKey(neighbor.row, neighbor.col));
      } else if (cell === color) {
        stack.push(neighbor);
      }
    }
  }

  return { stones, liberties };
}

function getNeighbors(row: number, col: number, rows: number, cols: number): Coord[] {
  return [
    { row: mod(row - 1, rows), col },
    { row: mod(row + 1, rows), col },
    { row, col: mod(col - 1, cols) },
    { row, col: mod(col + 1, cols) },
  ];
}

function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}
