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
const autoControlsEl = document.getElementById("auto-controls");
const autoStepBtn = document.getElementById(
  "auto-step-btn",
) as HTMLButtonElement | null;
const autoToggleBtn = document.getElementById(
  "auto-toggle-btn",
) as HTMLButtonElement | null;
const autoIntervalInput = document.getElementById(
  "auto-interval",
) as HTMLInputElement | null;
const autoIntervalValue = document.getElementById("auto-interval-value");
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
let playMode: "pvp" | "ai" | "auto" = "pvp";
let autoRunning = false;
let autoIntervalMs = autoIntervalInput
  ? Number.parseInt(autoIntervalInput.value, 10)
  : 600;
let autoTimer: number | null = null;

const game = new Game(canvas, {
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  onStateChange: updateStatus,
});

resetBtn?.addEventListener("click", () => {
  stopAuto();
  game.reset();
});

undoBtn?.addEventListener("click", () => {
  stopAuto();
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

autoStepBtn?.addEventListener("click", () => {
  if (playMode !== "auto" || autoRunning) return;
  const board = latestBoard;
  if (!board || board.phase !== "play") return;
  performAiMove(board);
});

autoToggleBtn?.addEventListener("click", () => {
  if (playMode !== "auto") return;
  if (autoRunning) {
    stopAuto();
  } else {
    startAuto();
  }
});

autoIntervalInput?.addEventListener("input", () => {
  const value = Number.parseInt(autoIntervalInput.value, 10);
  if (Number.isFinite(value)) {
    autoIntervalMs = value;
    updateIntervalLabel();
    if (autoRunning) {
      restartAutoTimer();
    }
  }
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
    undoBtn.disabled = board.moveHistory.length === 0 || autoRunning;
  }

  if (passBtn) {
    passBtn.disabled = !canHumanMove(board);
  }

  if (resumeBtn) {
    resumeBtn.disabled = board.phase !== "scoring";
  }

  scheduleAiMove(board);
  scheduleAutoMove(board);
  updateAutoUi(board);

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
  playMode = modeSelect?.value === "auto" ? "auto" : modeSelect?.value === "ai" ? "ai" : "pvp";
  aiEnabled = playMode === "ai";
  const selected = aiColorSelect?.value;
  if (selected === "black" || selected === "white") {
    aiPlayer = selected;
  }
  if (aiColorSelect) {
    aiColorSelect.disabled = playMode !== "ai";
  }
  if (autoControlsEl) {
    autoControlsEl.hidden = playMode !== "auto";
  }
  if (playMode !== "auto") {
    stopAuto();
  }
  const humanPlayer: PlayerColor | "both" | "none" = aiEnabled
    ? aiPlayer === "black"
      ? "white"
      : "black"
    : playMode === "auto"
      ? "none"
      : "both";
  game.setHumanPlayer(humanPlayer);
  if (!aiEnabled) {
    clearAiTimer();
  }
  if (latestBoard) {
    scheduleAiMove(latestBoard);
    scheduleAutoMove(latestBoard);
    updateAutoUi(latestBoard);
  }
}

function scheduleAiMove(board: BoardState) {
  if (
    playMode !== "ai" ||
    !aiEnabled ||
    board.phase !== "play" ||
    board.currentPlayer !== aiPlayer
  ) {
    clearAiTimer();
    return;
  }
  if (aiTimer !== null) return;
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    const current = latestBoard;
    if (
      !current ||
      playMode !== "ai" ||
      !aiEnabled ||
      current.phase !== "play" ||
      current.currentPlayer !== aiPlayer
    ) {
      return;
    }
    performAiMove(current);
  }, 380);
}

function clearAiTimer() {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function canHumanMove(board: BoardState) {
  if (board.phase !== "play") return false;
  if (playMode === "auto") return false;
  if (playMode === "ai") return board.currentPlayer !== aiPlayer;
  return true;
}

function scheduleAutoMove(board: BoardState) {
  if (playMode !== "auto") {
    clearAutoTimer();
    return;
  }
  if (board.phase !== "play") {
    stopAuto();
    return;
  }
  if (!autoRunning) {
    clearAutoTimer();
    return;
  }
  if (autoTimer !== null) return;
  autoTimer = window.setTimeout(() => {
    autoTimer = null;
    const current = latestBoard;
    if (!current || playMode !== "auto" || !autoRunning || current.phase !== "play") {
      return;
    }
    performAiMove(current);
    if (latestBoard) {
      scheduleAutoMove(latestBoard);
    }
  }, autoIntervalMs);
}

function performAiMove(board: BoardState) {
  const decision = ai.chooseMove(board);
  if (decision.type === "play") {
    const applied = game.playAt(decision.coord);
    if (!applied) {
      window.setTimeout(() => {
        if (latestBoard) scheduleAiMove(latestBoard);
        if (latestBoard) scheduleAutoMove(latestBoard);
      }, 80);
    }
  } else {
    game.pass();
  }
}

function startAuto() {
  autoRunning = true;
  updateAutoUi(latestBoard);
  if (latestBoard) {
    scheduleAutoMove(latestBoard);
  }
}

function stopAuto() {
  if (!autoRunning && autoTimer === null) return;
  autoRunning = false;
  clearAutoTimer();
  updateAutoUi(latestBoard);
}

function clearAutoTimer() {
  if (autoTimer !== null) {
    window.clearTimeout(autoTimer);
    autoTimer = null;
  }
}

function restartAutoTimer() {
  clearAutoTimer();
  if (latestBoard) {
    scheduleAutoMove(latestBoard);
  }
}

function updateIntervalLabel() {
  if (autoIntervalValue) {
    autoIntervalValue.textContent = `${autoIntervalMs} ms`;
  }
}

function updateAutoUi(board: BoardState | null) {
  if (!autoToggleBtn || !autoStepBtn) return;
  const inAuto = playMode === "auto";
  const canStep = Boolean(board && board.phase === "play");
  autoToggleBtn.textContent = autoRunning ? "自动暂停" : "自动开始";
  autoToggleBtn.disabled = !inAuto || !canStep;
  autoStepBtn.disabled = !inAuto || autoRunning || !canStep;
}

updateIntervalLabel();
applyAiSettings();
