import {
  BoardState,
  Coord,
  GameLoadRecord,
  PlayerColor,
} from "./core/types";

type SgfNode = {
  props: Record<string, string[]>;
  children: SgfNode[][];
};

export type SgfCoordStyle = "standard" | "skip-i";

export type SgfRecord = GameLoadRecord & {
  coordStyle: SgfCoordStyle;
};

const SGF_PROP_MOVE_BLACK = "B";
const SGF_PROP_MOVE_WHITE = "W";
const SGF_PROP_ADD_BLACK = "AB";
const SGF_PROP_ADD_WHITE = "AW";
const SGF_PROP_ADD_EMPTY = "AE";

export function parseSgf(
  text: string,
  fallbackRows = 19,
  fallbackCols = 19,
): SgfRecord {
  const roots = parseSgfTree(text);
  if (roots.length === 0) {
    throw new Error("SGF 内容为空或格式不正确。");
  }
  const mainLine = followMainLine(roots);
  if (mainLine.length === 0) {
    throw new Error("SGF 没有可用的节点。");
  }

  const root = mainLine[0];
  const sizeValue = root.props.SZ?.[0] ?? "";
  const size = parseSize(sizeValue, fallbackRows, fallbackCols);
  const rows = size.rows;
  const cols = size.cols;
  const komiValue = root.props.KM?.[0];
  const komi = komiValue ? Number.parseFloat(komiValue) : undefined;
  const nextPlayer = parsePlayer(root.props.PL?.[0] ?? "");

  const coordValues = collectCoordValues(mainLine);
  const coordStyle = detectCoordStyle(coordValues, rows, cols);

  const setup = {
    black: [] as Coord[],
    white: [] as Coord[],
    empty: [] as Coord[],
  };
  const moves: Array<{ player: PlayerColor; coord: Coord | null }> = [];

  for (const node of mainLine) {
    applySetupProperty(
      node.props[SGF_PROP_ADD_BLACK],
      setup.black,
      rows,
      cols,
      coordStyle,
    );
    applySetupProperty(
      node.props[SGF_PROP_ADD_WHITE],
      setup.white,
      rows,
      cols,
      coordStyle,
    );
    applySetupProperty(
      node.props[SGF_PROP_ADD_EMPTY],
      setup.empty,
      rows,
      cols,
      coordStyle,
    );

    const blackMove = node.props[SGF_PROP_MOVE_BLACK]?.[0];
    if (blackMove !== undefined) {
      const coord = parseMoveValue(blackMove, rows, cols, coordStyle);
      moves.push({ player: "black", coord });
    }

    const whiteMove = node.props[SGF_PROP_MOVE_WHITE]?.[0];
    if (whiteMove !== undefined) {
      const coord = parseMoveValue(whiteMove, rows, cols, coordStyle);
      moves.push({ player: "white", coord });
    }
  }

  return {
    rows,
    cols,
    komi,
    setup,
    moves,
    nextPlayer: moves.length === 0 ? nextPlayer : undefined,
    coordStyle,
  };
}

export function serializeSgf(
  board: BoardState,
  coordStyle: SgfCoordStyle,
  setup?: GameLoadRecord["setup"],
): string {
  const sizeValue =
    board.rows === board.cols
      ? String(board.rows)
      : `${board.cols}:${board.rows}`;

  const props: string[] = [
    "GM[1]",
    "FF[4]",
    "CA[UTF-8]",
    `SZ[${sizeValue}]`,
    `KM[${board.rules.komi}]`,
    "RU[Chinese]",
    "AP[Torus-Go]",
  ];

  if (setup) {
    if (setup.black.length > 0) {
      props.push(`AB${encodeSetup(setup.black, board.rows, coordStyle)}`);
    }
    if (setup.white.length > 0) {
      props.push(`AW${encodeSetup(setup.white, board.rows, coordStyle)}`);
    }
    if (setup.empty.length > 0) {
      props.push(`AE${encodeSetup(setup.empty, board.rows, coordStyle)}`);
    }
  }

  if (board.moveHistory.length === 0 && board.currentPlayer === "white") {
    props.push("PL[W]");
  }

  let sgf = `(;${props.join("")}`;
  for (const move of board.moveHistory) {
    const prop = move.player === "black" ? "B" : "W";
    const value = move.coord
      ? encodeCoord(move.coord, board.rows, coordStyle)
      : "";
    sgf += `;${prop}[${value}]`;
  }
  sgf += ")";
  return sgf;
}

function parseSgfTree(text: string): SgfNode[] {
  let index = 0;
  const length = text.length;

  const skipWhitespace = () => {
    while (index < length && /\s/.test(text[index])) {
      index += 1;
    }
  };

  const parseValue = () => {
    let value = "";
    if (text[index] !== "[") return value;
    index += 1;
    while (index < length) {
      const ch = text[index];
      if (ch === "\\") {
        index += 1;
        if (index < length) {
          value += text[index];
          index += 1;
        }
        continue;
      }
      if (ch === "]") {
        index += 1;
        break;
      }
      value += ch;
      index += 1;
    }
    return value;
  };

  const parseNode = (): SgfNode => {
    const props: Record<string, string[]> = {};
    if (text[index] !== ";") return { props, children: [] };
    index += 1;
    while (index < length) {
      skipWhitespace();
      const ch = text[index];
      if (!ch || ch < "A" || ch > "Z") break;
      let name = "";
      while (index < length) {
        const current = text[index];
        if (current < "A" || current > "Z") break;
        name += current;
        index += 1;
      }
      const values: string[] = [];
      skipWhitespace();
      while (text[index] === "[") {
        values.push(parseValue());
        skipWhitespace();
      }
      if (values.length > 0) {
        props[name] = (props[name] ?? []).concat(values);
      }
    }
    return { props, children: [] };
  };

  const parseSequence = (): SgfNode[] => {
    const sequence: SgfNode[] = [];
    while (index < length) {
      skipWhitespace();
      const ch = text[index];
      if (!ch) break;
      if (ch === ";") {
        sequence.push(parseNode());
        continue;
      }
      if (ch === "(") {
        if (sequence.length === 0) {
          parseGameTree();
        } else {
          const parent = sequence[sequence.length - 1];
          const variation = parseGameTree();
          if (variation.length > 0) {
            parent.children.push(variation);
          }
        }
        continue;
      }
      if (ch === ")") {
        break;
      }
      index += 1;
    }
    return sequence;
  };

  const parseGameTree = (): SgfNode[] => {
    if (text[index] !== "(") return [];
    index += 1;
    const sequence = parseSequence();
    skipWhitespace();
    if (text[index] === ")") {
      index += 1;
    }
    return sequence;
  };

  skipWhitespace();
  if (text[index] !== "(") return [];
  return parseGameTree();
}

function followMainLine(sequence: SgfNode[]): SgfNode[] {
  const line: SgfNode[] = [];
  let current: SgfNode[] | null = sequence;
  while (current && current.length > 0) {
    for (const node of current) {
      line.push(node);
    }
    const last = current[current.length - 1];
    if (last && last.children.length > 0) {
      current = last.children[0];
    } else {
      current = null;
    }
  }
  return line;
}

function parseSize(
  value: string,
  fallbackRows: number,
  fallbackCols: number,
): { rows: number; cols: number } {
  if (!value) {
    return { rows: fallbackRows, cols: fallbackCols };
  }
  if (value.includes(":")) {
    const [colsValue, rowsValue] = value.split(":");
    const cols = Number.parseInt(colsValue ?? "", 10);
    const rows = Number.parseInt(rowsValue ?? "", 10);
    if (Number.isFinite(rows) && Number.isFinite(cols) && rows > 0 && cols > 0) {
      return { rows, cols };
    }
  } else {
    const size = Number.parseInt(value, 10);
    if (Number.isFinite(size) && size > 0) {
      return { rows: size, cols: size };
    }
  }
  return { rows: fallbackRows, cols: fallbackCols };
}

function parsePlayer(value: string): PlayerColor | undefined {
  if (value === "B") return "black";
  if (value === "W") return "white";
  return undefined;
}

function collectCoordValues(nodes: SgfNode[]): string[] {
  const values: string[] = [];
  for (const node of nodes) {
    const props = node.props;
    for (const key of [
      SGF_PROP_MOVE_BLACK,
      SGF_PROP_MOVE_WHITE,
      SGF_PROP_ADD_BLACK,
      SGF_PROP_ADD_WHITE,
      SGF_PROP_ADD_EMPTY,
    ]) {
      const entry = props[key];
      if (entry) values.push(...entry);
    }
  }
  return values;
}

function detectCoordStyle(
  values: string[],
  rows: number,
  cols: number,
): SgfCoordStyle {
  let standardInvalid = 0;
  let skipInvalid = 0;
  for (const value of values) {
    if (value.length !== 2) continue;
    if (!isValidCoordValue(value, rows, cols, "standard")) {
      standardInvalid += 1;
    }
    if (!isValidCoordValue(value, rows, cols, "skip-i")) {
      skipInvalid += 1;
    }
  }
  if (standardInvalid > 0 && skipInvalid === 0) return "skip-i";
  if (standardInvalid === 0) return "standard";
  if (skipInvalid === 0) return "skip-i";
  return "standard";
}

function isValidCoordValue(
  value: string,
  rows: number,
  cols: number,
  style: SgfCoordStyle,
): boolean {
  const coord = parseCoord(value, rows, cols, style);
  return coord !== null;
}

function applySetupProperty(
  values: string[] | undefined,
  target: Coord[],
  rows: number,
  cols: number,
  style: SgfCoordStyle,
) {
  if (!values) return;
  for (const value of values) {
    for (const coord of parsePointValue(value, rows, cols, style)) {
      target.push(coord);
    }
  }
}

function parseMoveValue(
  value: string,
  rows: number,
  cols: number,
  style: SgfCoordStyle,
): Coord | null {
  if (!value) return null;
  return parseCoord(value, rows, cols, style);
}

function parsePointValue(
  value: string,
  rows: number,
  cols: number,
  style: SgfCoordStyle,
): Coord[] {
  if (!value) return [];
  if (value.length === 2) {
    const coord = parseCoord(value, rows, cols, style);
    return coord ? [coord] : [];
  }
  if (value.length === 5 && value[2] === ":") {
    const start = parseCoord(value.slice(0, 2), rows, cols, style);
    const end = parseCoord(value.slice(3), rows, cols, style);
    if (!start || !end) return [];
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const coords: Coord[] = [];
    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        coords.push({ row: r, col: c });
      }
    }
    return coords;
  }
  return [];
}

function parseCoord(
  value: string,
  rows: number,
  cols: number,
  style: SgfCoordStyle,
): Coord | null {
  if (value.length !== 2) return null;
  const col = coordCharToIndex(value[0], style);
  const rowFromBottom = coordCharToIndex(value[1], style);
  if (col < 0 || rowFromBottom < 0) return null;
  if (col >= cols || rowFromBottom >= rows) return null;
  return { row: rows - 1 - rowFromBottom, col };
}

function coordCharToIndex(ch: string, style: SgfCoordStyle): number {
  const code = ch.charCodeAt(0);
  if (code < 97 || code > 122) return -1;
  let idx = code - 97;
  if (style === "skip-i") {
    if (ch === "i") return -1;
    if (code > 105) idx -= 1;
  }
  return idx;
}

function encodeCoord(
  coord: Coord,
  rows: number,
  style: SgfCoordStyle,
): string {
  const colChar = indexToCoordChar(coord.col, style);
  const rowChar = indexToCoordChar(rows - 1 - coord.row, style);
  return `${colChar}${rowChar}`;
}

function encodeSetup(
  coords: Coord[],
  rows: number,
  style: SgfCoordStyle,
): string {
  return coords
    .map((coord) => `[${encodeCoord(coord, rows, style)}]`)
    .join("");
}

function indexToCoordChar(index: number, style: SgfCoordStyle): string {
  if (style === "skip-i") {
    const offset = index >= 8 ? 1 : 0;
    return String.fromCharCode(97 + index + offset);
  }
  return String.fromCharCode(97 + index);
}
