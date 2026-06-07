import type { Coord, GameState, PieceState, PieceType, Side } from "./types";

export type BuildPieceType = Exclude<PieceType, "king">;

export type AiStrategyMode = "aggressive" | "balanced" | "economic";

export type AiMoveReason =
  | "win"
  | "defend_king"
  | "capture"
  | "mine"
  | "enemy_mine"
  | "unblock"
  | "develop"
  | "pressure";

export type AiMoveCandidate = {
  id: string;
  pieceId: string;
  piece: PieceState;
  from: Coord;
  to: Coord;
  uci: string;
  score: number;
  reason: AiMoveReason;
};

export type AiBuildDecision = {
  type: "build";
  side: Side;
  pieceType: BuildPieceType;
  at: Coord;
  score: number;
  reason: "mine" | "combat" | "reserve";
};

export type AiMoveDecision = {
  type: "move";
  candidate: AiMoveCandidate;
  source: "engine" | "heuristic";
  raw?: string;
};

export type AiWaitDecision = {
  type: "wait";
  reason: "not_ready" | "no_candidate" | "pending_engine";
};

export type AiDecision = AiBuildDecision | AiMoveDecision | AiWaitDecision;

export type AiProfile = {
  actionIntervalMs: number;
  engineMovetimeMs: number;
  engineTimeoutMs: number;
  miningTarget: number;
  seed: string;
  strategyMode?: AiStrategyMode;
};

export type EngineMoveRequest = {
  state: GameState;
  side: Side;
  candidates: AiMoveCandidate[];
  movetimeMs: number;
  timeoutMs: number;
};

export type EngineMoveResult = {
  candidate?: AiMoveCandidate;
  uci?: string;
  source: "engine" | "heuristic";
  raw?: string;
  error?: string;
};

export interface EngineAdapter {
  readonly name: string;
  init(): Promise<void>;
  pickMove(request: EngineMoveRequest): Promise<EngineMoveResult>;
  dispose(): void;
}

export type AiBenchSummary = {
  games: number;
  redWins: number;
  blackWins: number;
  draws: number;
  averageGameTimeMs: number;
  averageFallbacks: number;
  averageMoves: number;
  averageBuilds: number;
  averageRedMinesAt60s: number;
  averageBlackMinesAt60s: number;
  averageRedOpponentMinesAt60s: number;
  averageBlackOpponentMinesAt60s: number;
  averageRedMoneyAt60s: number;
  averageBlackMoneyAt60s: number;
  averageCommandFailures: number;
  averageUncheckedKingThreats: number;
  averageHangingMoves: number;
  averageRedEndMoney: number;
  averageBlackEndMoney: number;
};
