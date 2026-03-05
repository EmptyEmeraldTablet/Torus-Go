import { Game } from "./core/game";
import {
  BoardState,
  GameLoadRecord,
  PlayerColor,
  Ruleset,
} from "./core/types";
import { DEFAULT_COLS, DEFAULT_ROWS } from "./core/constants";
import { AiDecision, BoardSnapshot, MctsAI, MctsOptions } from "./ai/mcts_ai";
import { parseSgf, serializeSgf, SgfCoordStyle } from "./sgf";

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
const aiStrengthBlackSelect = document.getElementById(
  "ai-strength-black",
) as HTMLSelectElement | null;
const aiStrengthWhiteSelect = document.getElementById(
  "ai-strength-white",
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
const thinkTimeInput = document.getElementById(
  "think-time",
) as HTMLInputElement | null;
const thinkTimeValue = document.getElementById("think-time-value");
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
const navUpBtn = document.getElementById("nav-up") as HTMLButtonElement | null;
const navDownBtn = document.getElementById("nav-down") as HTMLButtonElement | null;
const navLeftBtn = document.getElementById("nav-left") as HTMLButtonElement | null;
const navRightBtn = document.getElementById("nav-right") as HTMLButtonElement | null;
const viewResetBtn = document.getElementById(
  "view-reset-btn",
) as HTMLButtonElement | null;
const sgfSaveBtn = document.getElementById(
  "sgf-save-btn",
) as HTMLButtonElement | null;
const sgfLoadBtn = document.getElementById(
  "sgf-load-btn",
) as HTMLButtonElement | null;
const sgfFileInput = document.getElementById(
  "sgf-file-input",
) as HTMLInputElement | null;

if (!canvas) {
  throw new Error("Canvas element not found.");
}

const AI_STRENGTHS: Record<string, MctsOptions> = {
  easy: {
    iterations: 120,
    playoutDepth: 45,
    exploration: 1.6,
    candidateLimit: 10,
    rolloutUseHeuristic: false,
    timeBudgetMs: 80,
  },
  medium: {
    iterations: 450,
    playoutDepth: 70,
    exploration: 1.35,
    candidateLimit: 14,
    rolloutUseHeuristic: true,
    timeBudgetMs: 220,
  },
  hard: {
    iterations: 1200,
    playoutDepth: 100,
    exploration: 1.2,
    candidateLimit: 18,
    rolloutUseHeuristic: true,
    timeBudgetMs: 520,
  },
};

const aiOptionsByColor: Record<PlayerColor, MctsOptions> = {
  black: AI_STRENGTHS.medium,
  white: AI_STRENGTHS.medium,
};
const localAi = new MctsAI(AI_STRENGTHS.medium);
let aiWorker: Worker | null =
  typeof Worker !== "undefined"
    ? new Worker(new URL("./ai/mcts_worker.ts", import.meta.url), {
        type: "module",
      })
    : null;
let aiRequestId = 0;
const pendingAiRequests = new Map<number, (decision: AiDecision) => void>();
let aiInFlight = false;
type AiRequestStamp = {
  moveCount: number;
  currentPlayer: PlayerColor;
  phase: BoardState["phase"];
  mode: "ai" | "auto";
};
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
let autoDelayOverrideMs: number | null = null;
let thinkTimeMs = thinkTimeInput
  ? Number.parseInt(thinkTimeInput.value, 10)
  : 220;
let sgfCoordStyle: SgfCoordStyle = "skip-i";
let sgfSetup: GameLoadRecord["setup"] | null = null;

if (aiWorker) {
  aiWorker.addEventListener("message", (event: MessageEvent) => {
    const { id, decision } = event.data as { id: number; decision: AiDecision };
    const resolver = pendingAiRequests.get(id);
    if (resolver) {
      pendingAiRequests.delete(id);
      resolver(decision);
    }
  });
  aiWorker.addEventListener("error", () => {
    aiWorker = null;
    pendingAiRequests.clear();
    aiInFlight = false;
  });
}

const game = new Game(canvas, {
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  onStateChange: updateStatus,
});

resetBtn?.addEventListener("click", () => {
  stopAuto();
  sgfSetup = null;
  sgfCoordStyle = "skip-i";
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
    sgfSetup = null;
    sgfCoordStyle = "skip-i";
    game.setBoardSize(size, size);
  }
});

navUpBtn?.addEventListener("click", () => {
  game.moveView(-1, 0);
});

navDownBtn?.addEventListener("click", () => {
  game.moveView(1, 0);
});

navLeftBtn?.addEventListener("click", () => {
  game.moveView(0, -1);
});

navRightBtn?.addEventListener("click", () => {
  game.moveView(0, 1);
});

viewResetBtn?.addEventListener("click", () => {
  game.resetView();
});

sgfSaveBtn?.addEventListener("click", () => {
  const board = latestBoard;
  if (!board) return;
  const sgf = serializeSgf(board, sgfCoordStyle, sgfSetup ?? undefined);
  downloadSgf(sgf);
});

sgfLoadBtn?.addEventListener("click", () => {
  sgfFileInput?.click();
});

sgfFileInput?.addEventListener("change", () => {
  const file = sgfFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const content = typeof reader.result === "string" ? reader.result : "";
    try {
      stopAuto();
      clearAiTimer();
      cancelPendingAi();
      const record = parseSgf(content, DEFAULT_ROWS, DEFAULT_COLS);
      sgfCoordStyle = record.coordStyle;
      sgfSetup = record.setup;
      game.loadRecord(record);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SGF 解析失败。";
      window.alert(message);
    }
  };
  reader.readAsText(file);
  sgfFileInput.value = "";
});

modeSelect?.addEventListener("change", () => {
  applyAiSettings();
});

aiColorSelect?.addEventListener("change", () => {
  applyAiSettings();
});

aiStrengthBlackSelect?.addEventListener("change", () => {
  applyAiStrength();
});

aiStrengthWhiteSelect?.addEventListener("change", () => {
  applyAiStrength();
});

autoStepBtn?.addEventListener("click", () => {
  if (playMode !== "auto" || autoRunning || aiInFlight) return;
  const board = latestBoard;
  if (!board || board.phase !== "play") return;
  performAiMove(board, "auto");
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
      autoDelayOverrideMs = null;
      restartAutoTimer();
    }
  }
});

thinkTimeInput?.addEventListener("input", () => {
  const value = Number.parseInt(thinkTimeInput.value, 10);
  if (Number.isFinite(value)) {
    thinkTimeMs = value;
    updateThinkTimeLabel();
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
  updateAiStrengthControls();
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
  applyAiStrength();
}

function applyAiStrength() {
  const blackKey = aiStrengthBlackSelect?.value ?? "medium";
  const whiteKey = aiStrengthWhiteSelect?.value ?? "medium";
  const blackOptions = AI_STRENGTHS[blackKey] ?? AI_STRENGTHS.medium;
  const whiteOptions = AI_STRENGTHS[whiteKey] ?? AI_STRENGTHS.medium;
  aiOptionsByColor.black = blackOptions;
  aiOptionsByColor.white = whiteOptions;
}

function updateAiStrengthControls() {
  const inAi = playMode === "ai";
  if (aiStrengthBlackSelect) {
    aiStrengthBlackSelect.disabled =
      playMode === "pvp" || (inAi && aiPlayer !== "black");
  }
  if (aiStrengthWhiteSelect) {
    aiStrengthWhiteSelect.disabled =
      playMode === "pvp" || (inAi && aiPlayer !== "white");
  }
}

function getAiOptionsForPlayer(player: PlayerColor): MctsOptions {
  const base = aiOptionsByColor[player] ?? AI_STRENGTHS.medium;
  const budget = Number.isFinite(thinkTimeMs) ? thinkTimeMs : base.timeBudgetMs;
  if (!budget || budget <= 0 || !Number.isFinite(budget)) {
    return base;
  }
  const baseBudget = base.timeBudgetMs ?? budget;
  const scaledIterations = base.timeBudgetMs
    ? Math.max(40, Math.floor((base.iterations * budget) / baseBudget))
    : base.iterations;
  return {
    ...base,
    iterations: scaledIterations,
    timeBudgetMs: budget,
  };
}

function buildSnapshot(board: BoardState): BoardSnapshot {
  return {
    rows: board.rows,
    cols: board.cols,
    grid: board.grid.map((row) => row.slice()),
    currentPlayer: board.currentPlayer,
    koPoint: board.koPoint ? { ...board.koPoint } : null,
    consecutivePasses: board.consecutivePasses,
    rules: { ...board.rules },
  };
}

function makeAiStamp(board: BoardState, mode: "ai" | "auto"): AiRequestStamp {
  return {
    moveCount: board.moveHistory.length,
    currentPlayer: board.currentPlayer,
    phase: board.phase,
    mode,
  };
}

function isAiStampCurrent(stamp: AiRequestStamp): boolean {
  const board = latestBoard;
  if (!board) return false;
  if (playMode !== stamp.mode) return false;
  if (board.moveHistory.length !== stamp.moveCount) return false;
  if (board.currentPlayer !== stamp.currentPlayer) return false;
  if (board.phase !== stamp.phase) return false;
  if (stamp.mode === "ai") {
    if (!aiEnabled) return false;
    if (aiPlayer !== board.currentPlayer) return false;
  }
  return true;
}

function requestAiDecision(
  snapshot: BoardSnapshot,
  options: MctsOptions,
): Promise<AiDecision> {
  const worker = aiWorker;
  if (worker) {
    return new Promise((resolve) => {
      const id = aiRequestId;
      aiRequestId += 1;
      pendingAiRequests.set(id, resolve);
      worker.postMessage({ id, board: snapshot, options });
    });
  }
  return new Promise((resolve) => {
    window.setTimeout(() => {
      localAi.setOptions(options);
      resolve(localAi.chooseMove(snapshot));
    }, 0);
  });
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
  if (aiInFlight) return;
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
    performAiMove(current, "ai");
  }, 380);
}

function clearAiTimer() {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function cancelPendingAi() {
  aiInFlight = false;
  pendingAiRequests.clear();
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
  if (aiInFlight) return;
  if (autoTimer !== null) return;
  const delay = autoDelayOverrideMs ?? autoIntervalMs;
  autoDelayOverrideMs = null;
  autoTimer = window.setTimeout(() => {
    autoTimer = null;
    const current = latestBoard;
    if (!current || playMode !== "auto" || !autoRunning || current.phase !== "play") {
      return;
    }
    performAiMove(current, "auto");
    if (latestBoard) {
      scheduleAutoMove(latestBoard);
    }
  }, autoIntervalMs);
}

function performAiMove(board: BoardState, mode: "ai" | "auto") {
  if (aiInFlight) return;
  if (board.phase !== "play") return;
  if (mode === "ai") {
    if (!aiEnabled || board.currentPlayer !== aiPlayer) return;
  }
  if (mode === "auto" && playMode !== "auto") return;

  const snapshot = buildSnapshot(board);
  const options = getAiOptionsForPlayer(board.currentPlayer);
  const stamp = makeAiStamp(board, mode);
  const startTime = mode === "auto" ? performance.now() : 0;
  aiInFlight = true;

  requestAiDecision(snapshot, options)
    .then((decision) => {
      aiInFlight = false;
      if (!isAiStampCurrent(stamp)) return;
      const autoDelay =
        mode === "auto"
          ? Math.max(0, autoIntervalMs - (performance.now() - startTime))
          : null;
      if (decision.type === "play") {
        if (mode === "auto") {
          autoDelayOverrideMs = autoDelay;
        }
        const applied = game.playAt(decision.coord);
        if (!applied) {
          if (mode === "auto") {
            autoDelayOverrideMs = null;
          }
          window.setTimeout(() => {
            if (latestBoard) scheduleAiMove(latestBoard);
            if (latestBoard) scheduleAutoMove(latestBoard);
          }, 80);
        }
      } else {
        if (mode === "auto") {
          autoDelayOverrideMs = autoDelay;
        }
        game.pass();
      }
    })
    .catch(() => {
      aiInFlight = false;
    });
}

function startAuto() {
  autoRunning = true;
  autoDelayOverrideMs = null;
  updateAutoUi(latestBoard);
  if (latestBoard) {
    scheduleAutoMove(latestBoard);
  }
}

function stopAuto() {
  if (!autoRunning && autoTimer === null) return;
  autoRunning = false;
  autoDelayOverrideMs = null;
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
  autoDelayOverrideMs = null;
  if (latestBoard) {
    scheduleAutoMove(latestBoard);
  }
}

function downloadSgf(sgf: string) {
  const blob = new Blob([sgf], { type: "application/x-go-sgf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `torus-go-${formatDateStamp()}.sgf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDateStamp() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function updateIntervalLabel() {
  if (autoIntervalValue) {
    autoIntervalValue.textContent = `${autoIntervalMs} ms`;
  }
}

function updateThinkTimeLabel() {
  if (thinkTimeValue) {
    thinkTimeValue.textContent = `${thinkTimeMs} ms`;
  }
}

function updateAutoUi(board: BoardState | null) {
  if (!autoToggleBtn || !autoStepBtn) return;
  const inAuto = playMode === "auto";
  const canStep = Boolean(board && board.phase === "play");
  autoToggleBtn.textContent = autoRunning ? "自动暂停" : "自动开始";
  autoToggleBtn.disabled = !inAuto || !canStep;
  autoStepBtn.disabled = !inAuto || autoRunning || !canStep || aiInFlight;
}

updateIntervalLabel();
updateThinkTimeLabel();
applyAiSettings();
