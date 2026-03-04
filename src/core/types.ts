export type Coord = {
  row: number;
  col: number;
};

export type Player = "black" | "white" | null;
export type PlayerColor = Exclude<Player, null>;

export type GamePhase = "play" | "scoring";
export type KoRule = "simple";
export type ScoringRule = "area";
export type TaxRule = "none";
export type WhiteHandicapBonusRule = "0" | "N" | "N-1";

export type Ruleset = {
  name: "chinese";
  koRule: KoRule;
  scoringRule: ScoringRule;
  taxRule: TaxRule;
  allowSuicide: boolean;
  friendlyPassOk: boolean;
  hasButton: boolean;
  whiteHandicapBonusRule: WhiteHandicapBonusRule;
  komi: number;
};

export type GameResult = {
  black: number;
  white: number;
  winner: PlayerColor | "draw";
};

export type MoveRecord = {
  player: PlayerColor;
  coord: Coord | null;
  captured: Coord[];
  prevKo: Coord | null;
  prevPasses: number;
};

export type BoardState = {
  rows: number;
  cols: number;
  grid: Player[][];
  deadMap: boolean[][];
  currentPlayer: PlayerColor;
  moveHistory: MoveRecord[];
  koPoint: Coord | null;
  consecutivePasses: number;
  captures: Record<PlayerColor, number>;
  result: GameResult | null;
  phase: GamePhase;
  rules: Ruleset;
};

export type RenderMetrics = {
  boardX: number;
  boardY: number;
  boardWidth: number;
  boardHeight: number;
  cellSize: number;
  rows: number;
  cols: number;
};

export type PlaceRequest = {
  coord: Coord;
  rawRow: number;
  rawCol: number;
};
