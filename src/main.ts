import { Game } from "./core/game";
import { BoardState, PlayerColor, Ruleset } from "./core/types";
import { DEFAULT_COLS, DEFAULT_ROWS } from "./core/constants";
import { SimpleAI } from "./ai/simple_ai";

const canvas = document.getElementById("board-canvas") as HTMLCanvasElement | null;
const currentPlayerEl = document.getElementById("current-player");
const capturesEl = document.getElementById("captures");
const passesEl = document.getElementById("passes");
const resultEl = document.getElementById("result");
const rulesetEl = document.getElementById("ruleset");
const phaseEl = document.getElementById("phase");
const modeSelect = document.getElementById(
  "mode-select",
) as HTMLSelectElement | null;
const aiColorSelect = document.getElementById(
  "ai-color-select",
) as HTMLSelectElement | null;
const undoBtn = document.getElementById("undo-btn") as HTMLButtonElement | null;
const resetBtn = document.getElementById("reset-btn");
const passBtn = document.getElementById("pass-btn") as HTMLButtonElement | null;
const resumeBtn = document.getElementById(
  "resume-btn",
) as HTMLButtonElement | null;
const boardSizeSelect = document.getElementById(
  "board-size",
) as HTMLSelectElement | null;
const applySizeBtn = document.getElementById(
  "apply-size-btn",
) as HTMLButtonElement | null;

if (!canvas) {
  throw new Error("Canvas element not found.");
}

const ai = new SimpleAI();
let aiEnabled = false;
let aiPlayer: PlayerColor = "white";
let aiTimer: number | null = null;
let latestBoard: BoardState | null = null;

const game = new Game(canvas, {
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  onStateChange: updateStatus,
});

resetBtn?.addEventListener("click", () => {
  game.reset();
});

undoBtn?.addEventListener("click", () => {
  game.undo();
});

passBtn?.addEventListener("click", () => {
  game.pass();
});

resumeBtn?.addEventListener("click", () => {
  game.resumePlay();
});

applySizeBtn?.addEventListener("click", () => {
  if (!boardSizeSelect) return;
  const size = Number.parseInt(boardSizeSelect.value, 10);
  if (Number.isFinite(size) && size > 0) {
    game.setBoardSize(size, size);
  }
});

modeSelect?.addEventListener("change", () => {
  applyAiSettings();
});

aiColorSelect?.addEventListener("change", () => {
  applyAiSettings();
});

window.addEventListener("resize", () => {
  game.resize();
});

function updateStatus(board: BoardState) {
  latestBoard = board;
  const currentLabel = board.currentPlayer === "black" ? "黑棋" : "白棋";
  if (currentPlayerEl) {
    currentPlayerEl.textContent = currentLabel;
    currentPlayerEl.setAttribute("data-player", board.currentPlayer);
  }

  if (capturesEl) {
    capturesEl.textContent = `黑 ${board.captures.black} · 白 ${board.captures.white}`;
  }

  if (passesEl) {
    passesEl.textContent = `${board.consecutivePasses} / 2`;
  }

  if (rulesetEl) {
    rulesetEl.textContent = formatRuleset(board.rules);
  }

  if (phaseEl) {
    phaseEl.textContent = board.phase === "play" ? "对局中" : "清理阶段";
  }

  if (resultEl) {
    if (board.result) {
      const winnerLabel =
        board.result.winner === "draw"
          ? "平局"
          : board.result.winner === "black"
            ? "黑胜"
            : "白胜";
      resultEl.textContent = `${winnerLabel} (${board.result.black.toFixed(1)} : ${board.result.white.toFixed(1)})`;
      resultEl.setAttribute(
        "data-player",
        board.result.winner === "draw" ? "none" : board.result.winner,
      );
    } else {
      resultEl.textContent = `进行中 (贴目 ${board.rules.komi})`;
      resultEl.setAttribute("data-player", "none");
    }
  }

  if (undoBtn) {
    undoBtn.disabled = board.moveHistory.length === 0;
  }

  if (passBtn) {
    passBtn.disabled = board.phase !== "play" || isAiTurn(board);
  }

  if (resumeBtn) {
    resumeBtn.disabled = board.phase !== "scoring";
  }

  scheduleAiMove(board);

  if (boardSizeSelect) {
    const sizeValue = String(board.rows);
    if (boardSizeSelect.value !== sizeValue) {
      boardSizeSelect.value = sizeValue;
    }
  }
}

function formatRuleset(rules: Ruleset) {
  const name = rules.name === "chinese" ? "Chinese" : rules.name;
  const scoring = rules.scoringRule === "area" ? "面积计分" : rules.scoringRule;
  const ko = rules.koRule === "simple" ? "单劫" : rules.koRule;
  const suicide = rules.allowSuicide ? "可自杀" : "禁自杀";
  return `${name} · ${scoring} · ${ko} · ${suicide} · 贴目 ${rules.komi}`;
}

function applyAiSettings() {
  aiEnabled = modeSelect?.value === "ai";
  const selected = aiColorSelect?.value;
  if (selected === "black" || selected === "white") {
    aiPlayer = selected;
  }
  if (aiColorSelect) {
    aiColorSelect.disabled = !aiEnabled;
  }
  const humanPlayer: PlayerColor | "both" = aiEnabled
    ? aiPlayer === "black"
      ? "white"
      : "black"
    : "both";
  game.setHumanPlayer(humanPlayer);
  if (!aiEnabled) {
    clearAiTimer();
  }
  if (latestBoard) {
    scheduleAiMove(latestBoard);
  }
}

function scheduleAiMove(board: BoardState) {
  if (!aiEnabled || board.phase !== "play" || board.currentPlayer !== aiPlayer) {
    clearAiTimer();
    return;
  }
  if (aiTimer !== null) return;
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    const current = latestBoard;
    if (
      !current ||
      !aiEnabled ||
      current.phase !== "play" ||
      current.currentPlayer !== aiPlayer
    ) {
      return;
    }
    const decision = ai.chooseMove(current);
    if (decision.type === "play") {
      const applied = game.playAt(decision.coord);
      if (!applied) {
        window.setTimeout(() => {
          if (latestBoard) scheduleAiMove(latestBoard);
        }, 80);
      }
    } else {
      game.pass();
    }
  }, 380);
}

function clearAiTimer() {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function isAiTurn(board: BoardState) {
  return aiEnabled && board.phase === "play" && board.currentPlayer === aiPlayer;
}

applyAiSettings();
