import { BoardState, Player } from "./types";
import { CHINESE_RULES } from "./rules";

export function createEmptyGrid(rows: number, cols: number): Player[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
}

export function createEmptyFlagGrid(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );
}

export function createBoard(rows: number, cols: number): BoardState {
  return {
    rows,
    cols,
    grid: createEmptyGrid(rows, cols),
    deadMap: createEmptyFlagGrid(rows, cols),
    currentPlayer: "black",
    moveHistory: [],
    koPoint: null,
    consecutivePasses: 0,
    captures: {
      black: 0,
      white: 0,
    },
    result: null,
    phase: "play",
    rules: { ...CHINESE_RULES },
  };
}
