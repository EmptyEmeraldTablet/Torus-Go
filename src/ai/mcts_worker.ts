/// <reference lib="webworker" />
import { AiDecision, BoardSnapshot, MctsAI, MctsOptions } from "./mcts_ai";

type WorkerRequest = {
  id: number;
  board: BoardSnapshot;
  options: MctsOptions;
};

type WorkerResponse = {
  id: number;
  decision: AiDecision;
};

const ai = new MctsAI();

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, board, options } = event.data;
  ai.setOptions(options);
  const decision = ai.chooseMove(board);
  const response: WorkerResponse = { id, decision };
  self.postMessage(response);
});
