import { Coord, Player, PlayerColor, Ruleset } from "../core/types";
import { mod } from "../utils/math";

export type AiDecision =
  | { type: "play"; coord: Coord }
  | { type: "pass" };

export type BoardSnapshot = {
  rows: number;
  cols: number;
  grid: Player[][];
  currentPlayer: PlayerColor;
  koPoint: Coord | null;
  consecutivePasses: number;
  rules: Ruleset;
};

export type MctsOptions = {
  iterations: number;
  playoutDepth: number;
  exploration: number;
  candidateLimit: number;
  rolloutUseHeuristic: boolean;
  timeBudgetMs?: number;
};

type SimState = {
  rows: number;
  cols: number;
  grid: Player[][];
  currentPlayer: PlayerColor;
  koPoint: Coord | null;
  consecutivePasses: number;
  rules: Ruleset;
  neighborCache: Coord[][];
};

type Node = {
  state: SimState;
  parent: Node | null;
  move: Coord | null;
  children: Node[];
  untriedMoves: Array<Coord | null>;
  visits: number;
  value: number;
};

type GroupInfo = {
  stones: Coord[];
  liberties: Set<string>;
};

type MoveFeatures = {
  legal: boolean;
  captureCount: number;
  oppAtariCount: number;
  selfLiberties: number;
  selfAtari: boolean;
  adjacentOpp: number;
  adjacentOwn: number;
  fillsEye: boolean;
  territoryPotential: number;
  connectValue: number;
  cutValue: number;
  keyPoint: number;
};

const DEFAULT_OPTIONS: MctsOptions = {
  iterations: 400,
  playoutDepth: 80,
  exploration: 1.35,
  candidateLimit: 14,
  rolloutUseHeuristic: true,
};

const OPPONENT: Record<PlayerColor, PlayerColor> = {
  black: "white",
  white: "black",
};

const WEIGHTS = {
  captureCount: 100,
  oppAtariCount: 10,
  selfLiberties: 3,
  selfAtari: -20,
  adjacentOpp: 1.5,
  adjacentOwn: 0.5,
  fillsEye: -10,
  territoryPotential: 2,
  connectValue: 1,
  cutValue: 2,
  keyPoint: 1,
};

export class MctsAI {
  private options: MctsOptions;

  constructor(options: Partial<MctsOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setOptions(options: Partial<MctsOptions>) {
    this.options = { ...this.options, ...options };
  }

  chooseMove(board: BoardSnapshot): AiDecision {
    const rootState = toSimState(board);
    const rootPlayer = rootState.currentPlayer;
    const root: Node = {
      state: rootState,
      parent: null,
      move: null,
      children: [],
      untriedMoves: listCandidateMoves(rootState, this.options),
      visits: 0,
      value: 0,
    };

    if (root.untriedMoves.length === 0) {
      return { type: "pass" };
    }

    const deadline = this.options.timeBudgetMs
      ? performance.now() + this.options.timeBudgetMs
      : null;
    for (let i = 0; i < this.options.iterations; i += 1) {
      if (deadline !== null && performance.now() > deadline) break;
      const leaf = selectNode(root, this.options);
      const expanded = expandNode(leaf, this.options);
      const rolloutState = cloneState(expanded.state);
      const result = rollout(
        rolloutState,
        rootPlayer,
        this.options,
      );
      backpropagate(expanded, result);
    }

    const bestChild = root.children.reduce<Node | null>((best, child) => {
      if (!best) return child;
      return child.visits > best.visits ? child : best;
    }, null);

    if (!bestChild || bestChild.move === null) {
      return { type: "pass" };
    }
    return { type: "play", coord: bestChild.move };
  }
}

function selectNode(root: Node, options: MctsOptions): Node {
  let node = root;
  while (node.untriedMoves.length === 0 && node.children.length > 0) {
    node = selectChild(node, options.exploration);
  }
  return node;
}

function selectChild(node: Node, exploration: number): Node {
  let best = node.children[0];
  let bestScore = -Infinity;
  const logVisits = Math.log(Math.max(1, node.visits));
  for (const child of node.children) {
    const exploitation = child.visits === 0 ? 0 : child.value / child.visits;
    const explorationTerm =
      child.visits === 0
        ? Infinity
        : exploration * Math.sqrt(logVisits / child.visits);
    const score = exploitation + explorationTerm;
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function expandNode(node: Node, options: MctsOptions): Node {
  if (node.untriedMoves.length === 0) return node;
  const moveIndex = Math.floor(Math.random() * node.untriedMoves.length);
  const move = node.untriedMoves.splice(moveIndex, 1)[0] ?? null;
  const nextState = cloneState(node.state);
  const played = applyMove(nextState, move);
  if (!played) {
    return node;
  }
  const child: Node = {
    state: nextState,
    parent: node,
    move,
    children: [],
    untriedMoves: listCandidateMoves(nextState, options),
    visits: 0,
    value: 0,
  };
  node.children.push(child);
  return child;
}

function rollout(
  state: SimState,
  rootPlayer: PlayerColor,
  options: MctsOptions,
): number {
  for (let depth = 0; depth < options.playoutDepth; depth += 1) {
    if (isTerminal(state)) break;
    const move = pickRolloutMove(state, options);
    applyMove(state, move);
  }
  return scoreState(state, rootPlayer);
}

function backpropagate(node: Node, result: number) {
  let current: Node | null = node;
  while (current) {
    current.visits += 1;
    current.value += result;
    current = current.parent;
  }
}

function pickRolloutMove(state: SimState, options: MctsOptions): Coord | null {
  const moves = listCandidateMoves(state, options);
  if (moves.length === 0) return null;
  if (!options.rolloutUseHeuristic) {
    return moves[Math.floor(Math.random() * moves.length)] ?? null;
  }
  const scored = moves.map((move) => {
    if (!move) return { move, score: -5 };
    const features = analyzeMove(state, move, state.currentPlayer);
    const score = features.legal ? scoreFeatures(features) : -999;
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const slice = scored.slice(0, Math.max(1, options.candidateLimit));
  const scores = slice.map((item) => item.score);
  const minScore = Math.min(...scores);
  const weights = scores.map((value) => Math.max(0.05, value - minScore + 1));
  return weightedPick(slice.map((item) => item.move), weights);
}

function listCandidateMoves(
  state: SimState,
  options: MctsOptions,
): Array<Coord | null> {
  const scored: Array<{ move: Coord; score: number }> = [];
  let occupied = 0;
  const total = state.rows * state.cols;
  const candidateSet = new Set<number>();
  let hasStone = false;

  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (state.grid[r][c] !== null) {
        occupied += 1;
        hasStone = true;
        const origin = { row: r, col: c };
        for (const n1 of getNeighbors(state, origin)) {
          markCandidate(state, n1, candidateSet);
          for (const n2 of getNeighbors(state, n1)) {
            markCandidate(state, n2, candidateSet);
          }
        }
      }
    }
  }

  if (!hasStone) {
    const seeds = getOpeningSeeds(state);
    if (seeds.length > 0) {
      return seeds;
    }
  }

  const emptyCount = total - occupied;
  const allEmptyMoves: Coord[] = [];
  if (candidateSet.size < Math.min(6, emptyCount)) {
    for (let r = 0; r < state.rows; r += 1) {
      for (let c = 0; c < state.cols; c += 1) {
        if (state.grid[r][c] === null) {
          allEmptyMoves.push({ row: r, col: c });
        }
      }
    }
  }

  const candidates =
    allEmptyMoves.length > 0
      ? allEmptyMoves
      : Array.from(candidateSet, (index) => ({
          row: Math.floor(index / state.cols),
          col: index % state.cols,
        }));

  for (const coord of candidates) {
    const features = analyzeMove(state, coord, state.currentPlayer);
    if (!features.legal) continue;
    scored.push({ move: coord, score: scoreFeatures(features) });
  }

  if (scored.length === 0) {
    return [null];
  }

  scored.sort((a, b) => b.score - a.score);
  const limit = Math.max(4, options.candidateLimit);
  const trimmed = scored.slice(0, limit).map((item) => item.move);

  const ratio = occupied / total;
  const includePass = ratio > 0.78 || state.consecutivePasses > 0;
  if (includePass) trimmed.push(null);

  return trimmed;
}

function scoreFeatures(features: MoveFeatures): number {
  let score = 0;
  score += features.captureCount * WEIGHTS.captureCount;
  score += features.oppAtariCount * WEIGHTS.oppAtariCount;
  score += features.selfLiberties * WEIGHTS.selfLiberties;
  score += features.selfAtari ? WEIGHTS.selfAtari : 0;
  score += features.adjacentOpp * WEIGHTS.adjacentOpp;
  score += features.adjacentOwn * WEIGHTS.adjacentOwn;
  score += features.fillsEye ? WEIGHTS.fillsEye : 0;
  score += features.territoryPotential * WEIGHTS.territoryPotential;
  score += features.connectValue * WEIGHTS.connectValue;
  score += features.cutValue * WEIGHTS.cutValue;
  score += features.keyPoint * WEIGHTS.keyPoint;
  return score;
}

function analyzeMove(
  state: SimState,
  coord: Coord,
  player: PlayerColor,
): MoveFeatures {
  const opponent = OPPONENT[player];
  const features: MoveFeatures = {
    legal: false,
    captureCount: 0,
    oppAtariCount: 0,
    selfLiberties: 0,
    selfAtari: false,
    adjacentOpp: 0,
    adjacentOwn: 0,
    fillsEye: false,
    territoryPotential: 0,
    connectValue: 0,
    cutValue: 0,
    keyPoint: isStarPoint(coord, state.rows, state.cols) ? 1 : 0,
  };

  if (state.grid[coord.row][coord.col] !== null) return features;
  if (
    state.rules.koRule === "simple" &&
    state.koPoint &&
    state.koPoint.row === coord.row &&
    state.koPoint.col === coord.col
  ) {
    return features;
  }

  features.connectValue = Math.max(
    0,
    countAdjacentGroups(state, coord, player) - 1,
  );
  features.cutValue = Math.max(
    0,
    countAdjacentGroups(state, coord, opponent) - 1,
  );

  state.grid[coord.row][coord.col] = player;

  const captured = collectCaptures(state, coord, opponent);
  if (captured.length > 0) {
    for (const stone of captured) {
      state.grid[stone.row][stone.col] = null;
    }
  }

  const myGroup = collectGroup(state, coord);
  const liberties = myGroup.liberties.size;
  const legal = liberties > 0 || state.rules.allowSuicide;
  if (!legal) {
    state.grid[coord.row][coord.col] = null;
    for (const stone of captured) {
      state.grid[stone.row][stone.col] = opponent;
    }
    return features;
  }

  features.legal = true;
  features.captureCount = captured.length;
  features.selfLiberties = liberties;
  features.selfAtari = liberties === 1;

  const neighborGroupsChecked = new Set<string>();
  for (const neighbor of getNeighbors(state, coord)) {
    const cell = state.grid[neighbor.row][neighbor.col];
    if (cell === opponent) {
      features.adjacentOpp += 1;
      const key = coordKey(neighbor.row, neighbor.col);
      if (!neighborGroupsChecked.has(key)) {
        const group = collectGroup(state, neighbor);
        for (const stone of group.stones) {
          neighborGroupsChecked.add(coordKey(stone.row, stone.col));
        }
        if (group.liberties.size === 1) {
          features.oppAtariCount += 1;
        }
      }
    } else if (cell === player) {
      features.adjacentOwn += 1;
    }
  }

  features.fillsEye =
    captured.length === 0 &&
    features.adjacentOwn === 4 &&
    features.adjacentOpp === 0;

  features.territoryPotential = estimateTerritoryPotential(
    state,
    coord,
    player,
  );

  state.grid[coord.row][coord.col] = null;
  for (const stone of captured) {
    state.grid[stone.row][stone.col] = opponent;
  }

  return features;
}

function estimateTerritoryPotential(
  state: SimState,
  center: Coord,
  player: PlayerColor,
): number {
  const opponent = OPPONENT[player];
  let potential = 0;
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (Math.abs(dr) + Math.abs(dc) > 2) continue;
      const row = mod(center.row + dr, state.rows);
      const col = mod(center.col + dc, state.cols);
      if (state.grid[row][col] !== null) continue;
      let ownAdj = 0;
      let oppAdj = 0;
      for (const neighbor of getNeighbors(state, { row, col })) {
        const cell = state.grid[neighbor.row][neighbor.col];
        if (cell === player) ownAdj += 1;
        if (cell === opponent) oppAdj += 1;
      }
      if (ownAdj > oppAdj) potential += 1;
    }
  }
  return potential;
}

function countAdjacentGroups(
  state: SimState,
  coord: Coord,
  player: PlayerColor,
): number {
  const seen = new Set<string>();
  let count = 0;
  for (const neighbor of getNeighbors(state, coord)) {
    if (state.grid[neighbor.row][neighbor.col] !== player) continue;
    const key = coordKey(neighbor.row, neighbor.col);
    if (seen.has(key)) continue;
    const group = collectGroup(state, neighbor);
    for (const stone of group.stones) {
      seen.add(coordKey(stone.row, stone.col));
    }
    count += 1;
  }
  return count;
}

function applyMove(state: SimState, move: Coord | null): boolean {
  if (move === null) {
    state.consecutivePasses += 1;
    state.koPoint = null;
    state.currentPlayer = OPPONENT[state.currentPlayer];
    return true;
  }
  const { row, col } = move;
  if (state.grid[row][col] !== null) return false;
  if (
    state.rules.koRule === "simple" &&
    state.koPoint &&
    state.koPoint.row === row &&
    state.koPoint.col === col
  ) {
    return false;
  }

  const player = state.currentPlayer;
  const opponent = OPPONENT[player];
  state.grid[row][col] = player;

  const captured = collectCaptures(state, move, opponent);
  if (captured.length > 0) {
    for (const stone of captured) {
      state.grid[stone.row][stone.col] = null;
    }
  }

  const myGroup = collectGroup(state, move);
  if (myGroup.liberties.size === 0 && !state.rules.allowSuicide) {
    state.grid[row][col] = null;
    for (const stone of captured) {
      state.grid[stone.row][stone.col] = opponent;
    }
    return false;
  }

  state.consecutivePasses = 0;
  state.koPoint = getKoPoint(captured, myGroup);
  state.currentPlayer = opponent;
  return true;
}

function getKoPoint(captured: Coord[], group: GroupInfo): Coord | null {
  if (captured.length !== 1) return null;
  if (group.liberties.size !== 1) return null;
  const [libertyKey] = group.liberties;
  if (!libertyKey) return null;
  const [libRow, libCol] = libertyKey.split(",").map(Number);
  const onlyCaptured = captured[0];
  if (libRow === onlyCaptured.row && libCol === onlyCaptured.col) {
    return { row: libRow, col: libCol };
  }
  return null;
}

function collectCaptures(
  state: SimState,
  origin: Coord,
  opponent: PlayerColor,
): Coord[] {
  const captured: Coord[] = [];
  const checked = new Set<string>();
  for (const neighbor of getNeighbors(state, origin)) {
    if (state.grid[neighbor.row][neighbor.col] !== opponent) continue;
    const key = coordKey(neighbor.row, neighbor.col);
    if (checked.has(key)) continue;
    const group = collectGroup(state, neighbor);
    for (const stone of group.stones) {
      checked.add(coordKey(stone.row, stone.col));
    }
    if (group.liberties.size === 0) {
      captured.push(...group.stones);
    }
  }
  return captured;
}

function collectGroup(state: SimState, start: Coord): GroupInfo {
  const color = state.grid[start.row][start.col];
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

    for (const neighbor of getNeighbors(state, current)) {
      const cell = state.grid[neighbor.row][neighbor.col];
      if (cell === null) {
        liberties.add(coordKey(neighbor.row, neighbor.col));
      } else if (cell === color) {
        stack.push(neighbor);
      }
    }
  }
  return { stones, liberties };
}

function getNeighbors(state: SimState, coord: Coord): Coord[] {
  return state.neighborCache[coord.row * state.cols + coord.col];
}

function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

function isTerminal(state: SimState): boolean {
  return state.consecutivePasses >= 2;
}

function scoreState(state: SimState, rootPlayer: PlayerColor): number {
  const visited = new Set<string>();
  let blackScore = 0;
  let whiteScore = 0;

  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const cell = state.grid[r][c];
      if (cell === "black") {
        blackScore += 1;
        continue;
      }
      if (cell === "white") {
        whiteScore += 1;
        continue;
      }
      const key = coordKey(r, c);
      if (visited.has(key)) continue;
      const region = collectEmptyRegion(state, { row: r, col: c }, visited);
      if (region.bordering.size === 1) {
        const [owner] = region.bordering;
        if (owner === "black") blackScore += region.size;
        if (owner === "white") whiteScore += region.size;
      }
    }
  }

  whiteScore += state.rules.komi;
  if (blackScore === whiteScore) return 0.5;
  const winner = blackScore > whiteScore ? "black" : "white";
  return winner === rootPlayer ? 1 : 0;
}

function collectEmptyRegion(
  state: SimState,
  start: Coord,
  visited: Set<string>,
): { size: number; bordering: Set<PlayerColor> } {
  const bordering = new Set<PlayerColor>();
  const stack: Coord[] = [start];
  let size = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const key = coordKey(current.row, current.col);
    if (visited.has(key)) continue;
    visited.add(key);

    if (state.grid[current.row][current.col] !== null) {
      continue;
    }

    size += 1;
    for (const neighbor of getNeighbors(state, current)) {
      const cell = state.grid[neighbor.row][neighbor.col];
      if (cell === null) {
        stack.push(neighbor);
      } else {
        bordering.add(cell);
      }
    }
  }

  return { size, bordering };
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let threshold = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    threshold -= weights[i];
    if (threshold <= 0) return items[i];
  }
  return items[items.length - 1];
}

function toSimState(board: BoardSnapshot): SimState {
  const neighborCache = getNeighborCache(board.rows, board.cols);
  return {
    rows: board.rows,
    cols: board.cols,
    grid: board.grid.map((row) => row.slice()),
    currentPlayer: board.currentPlayer,
    koPoint: board.koPoint ? { ...board.koPoint } : null,
    consecutivePasses: board.consecutivePasses,
    rules: board.rules,
    neighborCache,
  };
}

function cloneState(state: SimState): SimState {
  return {
    rows: state.rows,
    cols: state.cols,
    grid: state.grid.map((row) => row.slice()),
    currentPlayer: state.currentPlayer,
    koPoint: state.koPoint ? { ...state.koPoint } : null,
    consecutivePasses: state.consecutivePasses,
    rules: state.rules,
    neighborCache: state.neighborCache,
  };
}

function isStarPoint(coord: Coord, rows: number, cols: number): boolean {
  if (rows !== cols) return false;
  if (rows === 9) {
    return (
      (coord.row === 2 && coord.col === 2) ||
      (coord.row === 2 && coord.col === 6) ||
      (coord.row === 4 && coord.col === 4) ||
      (coord.row === 6 && coord.col === 2) ||
      (coord.row === 6 && coord.col === 6)
    );
  }
  if (rows === 13 || rows === 19) {
    const mid = Math.floor(rows / 2);
    const edge = 3;
    const max = rows - 4;
    const points = [edge, mid, max];
    return points.includes(coord.row) && points.includes(coord.col);
  }
  return false;
}

function getOpeningSeeds(state: SimState): Array<Coord | null> {
  if (state.rows !== state.cols) return [];
  const size = state.rows;
  if (size === 9) {
    return [
      { row: 4, col: 4 },
      { row: 2, col: 2 },
      { row: 2, col: 6 },
      { row: 6, col: 2 },
      { row: 6, col: 6 },
    ];
  }
  if (size === 13 || size === 19) {
    const mid = Math.floor(size / 2);
    const edge = 3;
    const max = size - 4;
    return [
      { row: mid, col: mid },
      { row: edge, col: edge },
      { row: edge, col: max },
      { row: max, col: edge },
      { row: max, col: max },
      { row: edge, col: mid },
      { row: mid, col: edge },
      { row: max, col: mid },
      { row: mid, col: max },
    ];
  }
  return [];
}

function markCandidate(
  state: SimState,
  coord: Coord,
  bucket: Set<number>,
) {
  if (state.grid[coord.row][coord.col] !== null) return;
  bucket.add(coord.row * state.cols + coord.col);
}

const NEIGHBOR_CACHE = new Map<string, Coord[][]>();

function getNeighborCache(rows: number, cols: number): Coord[][] {
  const key = `${rows}x${cols}`;
  const cached = NEIGHBOR_CACHE.get(key);
  if (cached) return cached;
  const cache: Coord[][] = Array.from({ length: rows * cols }, () => []);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      cache[idx] = [
        { row: mod(r - 1, rows), col: c },
        { row: mod(r + 1, rows), col: c },
        { row: r, col: mod(c - 1, cols) },
        { row: r, col: mod(c + 1, cols) },
      ];
    }
  }
  NEIGHBOR_CACHE.set(key, cache);
  return cache;
}
