import {
  buildPiece,
  buildSquares,
  isLegalBuild,
  isLegalMove,
  legalMovesForPiece,
  MINING_TYPES,
  mineAt,
  movePiece,
  pieceAt,
  PIECE_VALUE,
  sameCoord,
} from "./rules";
import type {
  AiBuildDecision,
  AiDecision,
  AiMoveCandidate,
  AiMoveDecision,
  AiMoveReason,
  AiProfile,
  AiStrategyMode,
  AiWaitDecision,
  BuildPieceType,
} from "./aiTypes";
import type { Coord, GameState, PieceState, PieceType, Side } from "./types";

type CommitAiState = (updater: (state: GameState) => GameState) => void;

type SearchAction =
  | {
      kind: "move";
      candidate: AiMoveCandidate;
      score: number;
    }
  | {
      kind: "build";
      decision: AiBuildDecision;
      score: number;
    }
  | {
      kind: "wait";
      score: number;
    };

type SearchStats = {
  nodes: number;
  cutoffs: number;
  timedOut: boolean;
};

type AiStrategy = {
  mode: AiStrategyMode;
  homeMineTarget: number;
  totalMineTarget: number;
  opponentMineTarget: number;
  attackWeight: number;
  kingThreatBonus: number;
  bottomRankWeight: number;
  combatBuildBias: number;
};

export type HybridAiStats = {
  engineRequests: number;
  engineMoves: number;
  fallbackMoves: number;
  builds: number;
  waits: number;
};

export const DEFAULT_AI_PROFILE: AiProfile = {
  actionIntervalMs: 750,
  engineMovetimeMs: 0,
  engineTimeoutMs: 0,
  miningTarget: 5,
  seed: "search-ai-v1",
};

const SEARCH_BUDGET_MS = 60;
const SEARCH_DEPTH = 2;
const QUIESCENCE_DEPTH = 1;
const MAX_ROOT_ACTIONS = 22;
const MAX_REPLY_ACTIONS = 14;
const MAX_QUIESCENCE_ACTIONS = 8;
const WIN_SCORE = 1_000_000;
const KING_DANGER_SCORE = 18_000;
const MINING_BUILD_TYPES: BuildPieceType[] = ["pawn", "elephant", "advisor"];
const COMBAT_BUILD_TYPES: BuildPieceType[] = ["rook", "cannon", "horse"];
const ECONOMY_MINE_TARGET = 6;
const OPPONENT_MINE_TARGET = 2;
const EXPANSION_PAWN_FILES = new Set([2, 4, 6]);
const BRIDGE_MINE_FILES = new Set([2, 6]);
const STRATEGY_MODES: AiStrategyMode[] = ["aggressive", "balanced", "economic"];

export class HybridAiController {
  private stats: HybridAiStats = {
    engineRequests: 0,
    engineMoves: 0,
    fallbackMoves: 0,
    builds: 0,
    waits: 0,
  };

  constructor(private readonly profile: AiProfile = DEFAULT_AI_PROFILE) {}

  tick(state: GameState, nowMs: number, side: Side, commit: CommitAiState): void {
    if (state.status !== "running" || nowMs < state.aiNextActionAtMs) {
      return;
    }

    const decision = chooseSearchDecision(state, nowMs, side, this.profile);
    if (decision.type === "build") {
      this.stats.builds++;
      commit((current) => applyBuildDecision(current, decision, nowMs, this.profile));
      return;
    }
    if (decision.type === "wait") {
      this.stats.waits++;
      commit((current) => scheduleNextAction(current, nowMs, this.profile));
      return;
    }

    this.stats.fallbackMoves++;
    commit((current) => applyMoveDecision(current, decision, side, nowMs, this.profile));
  }

  reset(): void {
    return;
  }

  dispose(): void {
    return;
  }

  getStats(): HybridAiStats {
    return { ...this.stats };
  }
}

export function createHybridAiController(): HybridAiController {
  return new HybridAiController();
}

export function chooseAiDecision(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile = DEFAULT_AI_PROFILE,
): AiDecision {
  return chooseSearchDecision(state, nowMs, side, profile);
}

export function runAiStep(
  state: GameState,
  nowMs: number,
  aiSide: Side = "black",
  profile: AiProfile = DEFAULT_AI_PROFILE,
): GameState {
  if (state.status !== "running" || nowMs < state.aiNextActionAtMs) {
    return state;
  }
  const decision = chooseAiDecision(state, nowMs, aiSide, profile);
  if (decision.type === "build") {
    return applyBuildDecision(state, decision, nowMs, profile);
  }
  return applyMoveDecision(state, decision, aiSide, nowMs, profile);
}

function chooseSearchDecision(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
): AiDecision {
  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const searchStats: SearchStats = { nodes: 0, cutoffs: 0, timedOut: false };
  const actions = generateSearchActions(state, nowMs, side, profile, true).slice(0, MAX_ROOT_ACTIONS);
  if (actions.length === 0) {
    return { type: "wait", reason: "no_candidate" };
  }

  const winningAction = actions.find(actionWins);
  if (winningAction) {
    return actionToDecision(winningAction);
  }

  const urgentEconomyAction = pickUrgentEconomyAction(state, nowMs, side, actions, profile);
  if (urgentEconomyAction) {
    return actionToDecision(urgentEconomyAction);
  }

  let best = actions[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let alpha = Number.NEGATIVE_INFINITY;
  const beta = Number.POSITIVE_INFINITY;

  for (const action of actions) {
    if (Date.now() > deadline) {
      searchStats.timedOut = true;
      break;
    }
    const nextState = simulateAction(state, action, nowMs);
    const score =
      action.score +
      minimax(
        nextState,
        nowMs,
        opponentOf(side),
        side,
        SEARCH_DEPTH - 1,
        QUIESCENCE_DEPTH,
        alpha,
        beta,
        deadline,
        searchStats,
        profile,
      );
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
    alpha = Math.max(alpha, bestScore);
  }

  return actionToDecision(best);
}

function pickUrgentEconomyAction(
  state: GameState,
  nowMs: number,
  side: Side,
  actions: SearchAction[],
  profile: AiProfile,
): SearchAction | undefined {
  const strategy = getStrategy(state, side, profile);
  if (isKingInDanger(state, side, nowMs) || countActiveMines(state, side) >= strategy.totalMineTarget) {
    return undefined;
  }

  const homeMines = countHomeMinesControlled(state, side);
  const homeMiningAction = actions.find(
    (action) =>
      !isPrematureBridgeOccupyAction(state, side, action, profile) &&
      ((action.kind === "build" && action.decision.reason === "mine") ||
        (action.kind === "move" && (action.candidate.reason === "mine" || action.candidate.reason === "unblock"))),
  );
  if (homeMiningAction) {
    return homeMiningAction;
  }

  const directHomeMiningAction = findDirectHomeMiningAction(state, nowMs, side, profile);
  if (directHomeMiningAction) {
    return directHomeMiningAction;
  }

  if (homeMines < strategy.homeMineTarget) {
    return actions.find((action) => action.kind === "wait");
  }

  if (countOpponentMinesControlled(state, side) < strategy.opponentMineTarget) {
    const directOpponentMiningAction = findDirectOpponentMiningAction(state, nowMs, side, profile);
    if (directOpponentMiningAction) {
      return directOpponentMiningAction;
    }
  }

  return actions.find((action) => action.kind === "move" && action.candidate.reason === "enemy_mine");
}

function findDirectHomeMiningAction(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
): SearchAction | undefined {
  let best: SearchAction | undefined;
  for (const piece of Object.values(state.pieces)) {
    if (!piece.alive || piece.side !== side || nowMs < piece.cooldownUntilMs || !MINING_TYPES.has(piece.type)) {
      continue;
    }
    for (const to of legalMovesForPiece(state, piece)) {
      if (!mineAt(state, to) || isOpponentSideMine(to, side)) {
        continue;
      }
      const candidate: AiMoveCandidate = {
        id: `${piece.id}:${moveId(piece.position, to)}`,
        pieceId: piece.id,
        piece,
        from: { ...piece.position },
        to,
        uci: moveId(piece.position, to),
        score: 0,
        reason: "mine",
      };
      candidate.score = scoreMove(state, nowMs, side, candidate, profile);
      const action = scoreSafety(state, { kind: "move", candidate, score: candidate.score }, nowMs, side);
      if (
        action.score <= -KING_DANGER_SCORE ||
        isKingInDanger(simulateAction(state, action, nowMs), side, nowMs) ||
        isPrematureBridgeOccupyAction(state, side, action, profile)
      ) {
        continue;
      }
      if (!best || action.score > best.score) {
        best = action;
      }
    }
  }

  for (const pieceType of MINING_BUILD_TYPES) {
    const cost = state.rules.unitCosts[pieceType];
    if (state.players[side].money < cost || !shouldBuildPieceType(state, side, pieceType, profile)) {
      continue;
    }
    for (const at of buildSquares(side, pieceType)) {
      if (!isLegalBuild(state, side, pieceType, at) || !isUsefulMiningBuildSquare(state, side, pieceType, at, profile)) {
        continue;
      }
      const score = scoreBuild(state, side, pieceType, at, profile);
      const decision: AiBuildDecision = {
        type: "build",
        side,
        pieceType,
        at,
        score,
        reason: "mine",
      };
      const action = scoreSafety(state, { kind: "build", decision, score }, nowMs, side);
      if (action.score <= -KING_DANGER_SCORE || isPrematureBridgeOccupyAction(state, side, action, profile)) {
        continue;
      }
      if (!best || action.score > best.score) {
        best = action;
      }
    }
  }

  return best;
}

function findDirectOpponentMiningAction(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
): SearchAction | undefined {
  let best: SearchAction | undefined;
  for (const piece of Object.values(state.pieces)) {
    if (!piece.alive || piece.side !== side || nowMs < piece.cooldownUntilMs || piece.type !== "pawn") {
      continue;
    }
    for (const to of legalMovesForPiece(state, piece)) {
      if (!isEnemyMineMove(state, piece, to)) {
        continue;
      }
      const candidate: AiMoveCandidate = {
        id: `${piece.id}:${moveId(piece.position, to)}`,
        pieceId: piece.id,
        piece,
        from: { ...piece.position },
        to,
        uci: moveId(piece.position, to),
        score: 0,
        reason: "enemy_mine",
      };
      candidate.score = scoreMove(state, nowMs, side, candidate, profile);
      const action = scoreSafety(state, { kind: "move", candidate, score: candidate.score }, nowMs, side);
      if (action.score <= -KING_DANGER_SCORE || isKingInDanger(simulateAction(state, action, nowMs), side, nowMs)) {
        continue;
      }
      if (!best || action.score > best.score) {
        best = action;
      }
    }
  }
  return best;
}

function isPrematureBridgeOccupyAction(
  state: GameState,
  side: Side,
  action: SearchAction,
  profile: AiProfile,
): boolean {
  const strategy = getStrategy(state, side, profile);
  const expansionPawnFiles = countExpansionPawnFiles(state, side);
  const opponentMines = countOpponentMinesControlled(state, side);
  if (opponentMines >= strategy.opponentMineTarget) {
    return false;
  }
  if (action.kind === "move") {
    const piece = action.candidate.piece;
    const to = action.candidate.to;
    return (
      piece.type !== "pawn" &&
      isBridgeMine(to, side) &&
      !isOpponentSideMine(to, side) &&
      (hasPawnBehindBridge(state, side, to) || expansionPawnFiles < 3)
    );
  }
  if (action.kind === "build") {
    const at = action.decision.at;
    return (
      action.decision.pieceType !== "pawn" &&
      isBridgeMine(at, side) &&
      !isOpponentSideMine(at, side) &&
      (hasPawnBehindBridge(state, side, at) || expansionPawnFiles < 3)
    );
  }
  return false;
}

function getStrategy(state: GameState, side: Side, profile: AiProfile): AiStrategy {
  const mode = profile.strategyMode ?? chooseHiddenStrategyMode(state, side, profile);
  const balancedHomeTarget = profile.miningTarget;
  if (mode === "aggressive") {
    return {
      mode,
      homeMineTarget: Math.max(4, balancedHomeTarget - 1),
      totalMineTarget: Math.max(4, balancedHomeTarget - 1),
      opponentMineTarget: 0,
      attackWeight: 1.55,
      kingThreatBonus: 1650,
      bottomRankWeight: 900,
      combatBuildBias: 520,
    };
  }
  if (mode === "economic") {
    return {
      mode,
      homeMineTarget: balancedHomeTarget,
      totalMineTarget: Math.max(ECONOMY_MINE_TARGET, balancedHomeTarget + 1),
      opponentMineTarget: Math.max(OPPONENT_MINE_TARGET, 2),
      attackWeight: 0.95,
      kingThreatBonus: 950,
      bottomRankWeight: 560,
      combatBuildBias: 80,
    };
  }
  return {
    mode,
    homeMineTarget: balancedHomeTarget,
    totalMineTarget: balancedHomeTarget,
    opponentMineTarget: 0,
    attackWeight: 1.2,
    kingThreatBonus: 1250,
    bottomRankWeight: 720,
    combatBuildBias: 260,
  };
}

function chooseHiddenStrategyMode(state: GameState, side: Side, profile: AiProfile): AiStrategyMode {
  const hash = hashString(`${profile.seed}:${state.gameId}:${side}`);
  return STRATEGY_MODES[hash % STRATEGY_MODES.length];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function moveId(from: Coord, to: Coord): string {
  return `${coordId(from)}${coordId(to)}`;
}

function coordId(coord: Coord): string {
  return `${String.fromCharCode(97 + coord.x)}${coord.y}`;
}

function minimax(
  state: GameState,
  nowMs: number,
  sideToMove: Side,
  rootSide: Side,
  depth: number,
  quiescenceDepth: number,
  alpha: number,
  beta: number,
  deadline: number,
  stats: SearchStats,
  profile: AiProfile,
): number {
  stats.nodes++;
  if (state.status === "ended") {
    return state.winner === rootSide ? WIN_SCORE : -WIN_SCORE;
  }
  if (Date.now() > deadline) {
    stats.timedOut = true;
    return evaluateState(state, nowMs, rootSide, profile);
  }

  const maximizing = sideToMove === rootSide;
  const actions = generateSearchActions(state, nowMs, sideToMove, profile, false);
  const tacticalActions =
    depth <= 0
      ? actions.filter((action) => isTacticalAction(action, state, nowMs, sideToMove))
      : actions;

  if (depth <= 0 && (quiescenceDepth <= 0 || tacticalActions.length === 0)) {
    return evaluateState(state, nowMs, rootSide, profile);
  }

  const limitedActions = tacticalActions.slice(
    0,
    depth <= 0 ? MAX_QUIESCENCE_ACTIONS : MAX_REPLY_ACTIONS,
  );
  if (limitedActions.length === 0) {
    return evaluateState(state, nowMs, rootSide, profile);
  }

  if (maximizing) {
    let best = Number.NEGATIVE_INFINITY;
    for (const action of limitedActions) {
      const score = minimax(
        simulateAction(state, action, nowMs),
        nowMs,
        opponentOf(sideToMove),
        rootSide,
        depth - 1,
        depth <= 0 ? quiescenceDepth - 1 : quiescenceDepth,
        alpha,
        beta,
        deadline,
        stats,
        profile,
      );
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (alpha >= beta) {
        stats.cutoffs++;
        break;
      }
    }
    return best;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const action of limitedActions) {
    const score = minimax(
      simulateAction(state, action, nowMs),
      nowMs,
      opponentOf(sideToMove),
      rootSide,
      depth - 1,
      depth <= 0 ? quiescenceDepth - 1 : quiescenceDepth,
      alpha,
      beta,
      deadline,
      stats,
      profile,
    );
    best = Math.min(best, score);
    beta = Math.min(beta, best);
    if (alpha >= beta) {
      stats.cutoffs++;
      break;
    }
  }
  return best;
}

function generateSearchActions(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
  root: boolean,
): SearchAction[] {
  const inDanger = isKingInDanger(state, side, nowMs);
  const actions = [
    ...generateMoveActions(state, nowMs, side, profile),
    ...generateBuildActions(state, nowMs, side, profile, inDanger),
    { kind: "wait" as const, score: 0 },
  ];
  const legalActions = inDanger
    ? actions.filter((action) => !isKingInDanger(simulateAction(state, action, nowMs), side, nowMs))
    : actions;
  const safeActions = legalActions
    .map((action) => scoreSafety(state, action, nowMs, side))
    .filter((action) => action.score > -KING_DANGER_SCORE || actionWins(action));

  return safeActions.sort((a, b) => b.score - a.score).slice(0, root ? MAX_ROOT_ACTIONS : MAX_REPLY_ACTIONS);
}

function generateMoveActions(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
): SearchAction[] {
  const actions: SearchAction[] = [];
  const kingThreats = findKingThreats(state, side, nowMs);

  for (const piece of Object.values(state.pieces)) {
    if (!piece.alive || piece.side !== side || nowMs < piece.cooldownUntilMs) {
      continue;
    }

    for (const to of legalMovesForPiece(state, piece)) {
      const from = { ...piece.position };
      const target = pieceAt(state, to);
      const reason = classifyMove(state, piece, to, kingThreats);
      const candidate: AiMoveCandidate = {
        id: `${piece.id}:${moveId(from, to)}`,
        pieceId: piece.id,
        piece,
        from,
        to,
        uci: moveId(from, to),
        score: 0,
        reason: target?.type === "king" ? "win" : reason,
      };
      candidate.score = scoreMove(state, nowMs, side, candidate, profile);
      actions.push({ kind: "move", candidate, score: candidate.score });
    }
  }

  return actions;
}

function generateBuildActions(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
  emergency: boolean,
): SearchAction[] {
  const buildTypes = emergency
    ? [...MINING_BUILD_TYPES, ...COMBAT_BUILD_TYPES]
    : shouldBuildForEconomy(state, side, profile)
      ? MINING_BUILD_TYPES
      : COMBAT_BUILD_TYPES;
  const actions: SearchAction[] = [];

  for (const pieceType of buildTypes) {
    const cost = state.rules.unitCosts[pieceType];
    if (state.players[side].money < cost || (!emergency && !shouldBuildPieceType(state, side, pieceType, profile))) {
      continue;
    }

    for (const at of buildSquares(side, pieceType)) {
      if (!isLegalBuild(state, side, pieceType, at)) {
        continue;
      }
      const score = scoreBuild(state, side, pieceType, at, profile);
      if (score <= -999) {
        continue;
      }
      const decision: AiBuildDecision = {
        type: "build",
        side,
        pieceType,
        at,
        score,
        reason: MINING_TYPES.has(pieceType) ? "mine" : "combat",
      };
      actions.push({ kind: "build", decision, score });
    }
  }

  return actions;
}

function classifyMove(
  state: GameState,
  piece: PieceState,
  to: Coord,
  kingThreats: PieceState[],
): AiMoveReason {
  const target = pieceAt(state, to);
  if (target?.type === "king") {
    return "win";
  }
  if (kingThreats.some((threat) => target?.id === threat.id)) {
    return "defend_king";
  }
  if (isBuildUnblockMove(state, piece, to)) {
    return "unblock";
  }
  if (isEnemyMineMove(state, piece, to)) {
    return "enemy_mine";
  }
  if (isMiningMove(state, piece, to)) {
    return "mine";
  }
  if (target) {
    return "capture";
  }
  if (moveCreatesKingThreat(state, piece, to)) {
    return "pressure";
  }
  return distanceToOpponentKing(state, to, piece.side) <= 4 ? "pressure" : "develop";
}

function scoreMove(
  state: GameState,
  nowMs: number,
  side: Side,
  candidate: AiMoveCandidate,
  profile: AiProfile,
): number {
  const piece = candidate.piece;
  const target = pieceAt(state, candidate.to);
  const activeMines = countActiveMines(state, side);
  const homeMines = countHomeMinesControlled(state, side);
  const opponentMines = countOpponentMinesControlled(state, side);
  const expansionPawnFiles = countExpansionPawnFiles(state, side);
  const strategy = getStrategy(state, side, profile);
  const stableEconomy = activeMines >= strategy.homeMineTarget;
  const wantsOpponentMines = opponentMines < strategy.opponentMineTarget;
  const combatPiece = isCombatPieceType(piece.type);
  const miningPiece = MINING_TYPES.has(piece.type);
  const kingDistanceGain =
    distanceToOpponentKing(state, candidate.from, side) -
    distanceToOpponentKing(state, candidate.to, side);
  const enemyMineDistanceGain =
    distanceToNearestOpponentMine(state, side, candidate.from) -
    distanceToNearestOpponentMine(state, side, candidate.to);
  let score = 0;

  if (target) {
    score += PIECE_VALUE[target.type] * (target.type === "king" ? 120 : 1);
  }
  if (candidate.reason === "defend_king") {
    score += 3200;
  }
  if (candidate.reason === "mine") {
    score += homeMines < strategy.homeMineTarget ? 1450 : 900;
  }
  if (candidate.reason === "enemy_mine") {
    score += wantsOpponentMines ? 1200 + strategy.opponentMineTarget * 800 : 1050;
    if (homeMines < strategy.homeMineTarget) {
      score -= 2400;
    }
  }
  if (candidate.reason === "unblock") {
    score += 3200;
  }
  if (candidate.reason === "pressure") {
    score += 220;
  }
  if (mineAt(state, candidate.to) && miningPiece) {
    if (isOpponentSideMine(candidate.to, side)) {
      score += wantsOpponentMines ? 2400 : 1300;
    } else if (piece.type === "pawn" && isBridgeMine(candidate.to, side)) {
      score += 1050;
    } else {
      score += 650;
    }
    if (
      piece.type !== "pawn" &&
      isBridgeMine(candidate.to, side) &&
      !isOpponentSideMine(candidate.to, side) &&
      wantsOpponentMines &&
      (hasPawnBehindBridge(state, side, candidate.to) || expansionPawnFiles < 3)
    ) {
      score -= hasPawnBehindBridge(state, side, candidate.to) ? 7200 : 6200;
    }
  }
  if (mineAt(state, candidate.from) && !mineAt(state, candidate.to) && miningPiece) {
    score -= 2600;
  } else if (mineAt(state, candidate.from) && mineAt(state, candidate.to) && miningPiece) {
    const pawnEnemyExpansion =
      piece.type === "pawn" &&
      isOpponentSideMine(candidate.to, side) &&
      stableEconomy &&
      homeMines >= strategy.homeMineTarget;
    score += pawnEnemyExpansion ? 1200 : 0;
  }
  if (kingDistanceGain > 0) {
    score += kingDistanceGain * (combatPiece ? 105 : 55) * strategy.attackWeight;
  }
  if (enemyMineDistanceGain > 0) {
    score += enemyMineDistanceGain * (piece.type === "pawn" ? (wantsOpponentMines ? 260 : 150) : 35);
  }
  if (isOpponentHalf(candidate.to, side)) {
    score += combatPiece ? 120 : 60;
  }
  if (moveCreatesKingThreat(state, piece, candidate.to)) {
    score += combatPiece ? strategy.kingThreatBonus : strategy.kingThreatBonus * 0.55;
  }
  if (combatPiece) {
    score += 120 + strategy.combatBuildBias * 0.1;
  }
  if (piece.type === "pawn") {
    score += forwardProgress(piece.side, candidate.from, candidate.to) * 45;
  }
  const simulatedMove = simulateMove(state, candidate, nowMs);
  const immediatelyAttacked = isPieceAttackedBySide(simulatedMove, candidate.pieceId, opponentOf(side), nowMs);
  if (immediatelyAttacked) {
    const defended = isPieceAttackedBySide(simulatedMove, candidate.pieceId, side, nowMs);
    score -= PIECE_VALUE[piece.type] * (defended ? 0.65 : target ? 1.6 : 3.2);
    if (!defended && candidate.reason === "enemy_mine") {
      score -= 1800;
    } else if (!defended && candidate.reason === "mine") {
      score -= 850;
    }
  }
  if (!immediatelyAttacked && isPieceThreatenedBeforeReady(simulatedMove, candidate.pieceId, opponentOf(side))) {
    const defended = isPieceThreatenedBeforeReady(simulatedMove, candidate.pieceId, side);
    score -= PIECE_VALUE[piece.type] * (defended ? 0.55 : 2.4);
    if (!defended && (candidate.reason === "enemy_mine" || candidate.reason === "mine")) {
      score -= 1250;
    }
  }
  const backRankControlGain =
    countOpponentBackRankBuildSquaresControlled(simulatedMove, side, nowMs) -
    countOpponentBackRankBuildSquaresControlled(state, side, nowMs);
  if (backRankControlGain > 0) {
    score += backRankControlGain * strategy.bottomRankWeight;
  }

  return score;
}

function scoreBuild(
  state: GameState,
  side: Side,
  pieceType: BuildPieceType,
  at: Coord,
  profile: AiProfile,
): number {
  const activeMines = countActiveMines(state, side);
  const homeMines = countHomeMinesControlled(state, side);
  const opponentMines = countOpponentMinesControlled(state, side);
  const strategy = getStrategy(state, side, profile);
  const cost = state.rules.unitCosts[pieceType];
  const sameTypeCount = countAlivePieces(state, side, pieceType);
  const expansionPawnFiles = countExpansionPawnFiles(state, side);
  let score = 0;

  const economyMode = shouldBuildForEconomy(state, side, profile);

  if (economyMode && MINING_TYPES.has(pieceType)) {
    if (!isUsefulMiningBuildSquare(state, side, pieceType, at, profile)) {
      return Number.NEGATIVE_INFINITY;
    }
    score += homeMines < strategy.homeMineTarget ? 2200 : 1450;
    if (mineAt(state, at)) {
      score += 650;
    }
    if (pieceType === "pawn" && EXPANSION_PAWN_FILES.has(at.x)) {
      const backfillPawn =
        hasPawnOnFile(state, side, at.x) &&
        countExpansionPawnFiles(state, side) >= 3 &&
        !hasPawnBehindBridge(state, side, homePawnMineCoord(side, at.x));
      score += at.x === 4 ? 700 : 1250;
      if (opponentMines < strategy.opponentMineTarget) {
        score += 900;
      }
      if (hasPawnOnFile(state, side, at.x)) {
        score += backfillPawn ? 550 : -1100;
      }
    }
    if (
      pieceType === "elephant" &&
      isBridgeMine(at, side) &&
      opponentMines < strategy.opponentMineTarget &&
      (hasPawnBehindBridge(state, side, at) || expansionPawnFiles < 3)
    ) {
      score -= expansionPawnFiles < 2 ? 5200 : 3600;
    }
    score += Math.max(0, 7 - distanceToNearestUsefulMine(state, side, at)) * 80;
  } else if (isCombatPieceType(pieceType)) {
    score += (economyMode ? 320 : 760) + strategy.combatBuildBias + PIECE_VALUE[pieceType] / (economyMode ? 3 : 2);
    score -= sameTypeCount * (economyMode ? 220 : 150);
    if (economyMode) {
      score -= Math.max(0, strategy.totalMineTarget - activeMines) * 360;
    }
  } else {
    return Number.NEGATIVE_INFINITY;
  }

  score -= cost * 3;
  return score;
}

function shouldBuildPieceType(
  state: GameState,
  side: Side,
  pieceType: BuildPieceType,
  profile: AiProfile,
): boolean {
  const activeMines = countActiveMines(state, side);
  const opponentMines = countOpponentMinesControlled(state, side);
  const strategy = getStrategy(state, side, profile);
  const sameTypeCount = countAlivePieces(state, side, pieceType);
  if (shouldBuildForEconomy(state, side, profile)) {
    if (pieceType === "pawn") {
      return sameTypeCount < (activeMines < strategy.homeMineTarget && countExpansionPawnFiles(state, side) >= 3 ? 5 : 3);
    }
    if (pieceType === "elephant") {
      return sameTypeCount < (activeMines < strategy.totalMineTarget ? 3 : opponentMines < strategy.opponentMineTarget ? 2 : 3);
    }
    if (isCombatPieceType(pieceType)) {
      return false;
    }
    return sameTypeCount < 1;
  }

  if (pieceType === "rook") {
    return sameTypeCount < (state.players[side].money >= 150 ? 3 : 2);
  }
  if (pieceType === "cannon") {
    return sameTypeCount < (state.players[side].money >= 150 ? 3 : 2);
  }
  if (pieceType === "horse") {
    return sameTypeCount < 2;
  }
  return false;
}

function scoreSafety(
  state: GameState,
  action: SearchAction,
  nowMs: number,
  side: Side,
): SearchAction {
  const next = simulateAction(state, action, nowMs);
  let score = action.score;
  if (next.status === "ended" && next.winner === side) {
    score += WIN_SCORE;
  } else if (isKingInDanger(next, side, nowMs)) {
    score -= KING_DANGER_SCORE;
  }
  if (action.kind === "move" && action.candidate.reason !== "win") {
    const movedPiece = next.pieces[action.candidate.pieceId];
    const immediatelyAttacked = movedPiece?.alive && isPieceAttackedBySide(next, movedPiece.id, opponentOf(side), nowMs);
    if (movedPiece?.alive && immediatelyAttacked) {
      const defended = isPieceAttackedBySide(next, movedPiece.id, side, nowMs);
      score -= PIECE_VALUE[movedPiece.type] * (defended ? 0.7 : 3.4);
      if (!defended && action.candidate.reason === "enemy_mine") {
        score -= 2100;
      } else if (!defended && action.candidate.reason === "mine") {
        score -= 950;
      }
    } else if (
      movedPiece?.alive &&
      isPieceThreatenedBeforeReady(next, movedPiece.id, opponentOf(side))
    ) {
      const defended = isPieceThreatenedBeforeReady(next, movedPiece.id, side);
      score -= PIECE_VALUE[movedPiece.type] * (defended ? 0.6 : 2.6);
      if (!defended && (action.candidate.reason === "enemy_mine" || action.candidate.reason === "mine")) {
        score -= 1450;
      }
    }
  }
  return { ...action, score };
}

function evaluateState(
  state: GameState,
  nowMs: number,
  rootSide: Side,
  profile: AiProfile,
): number {
  if (state.status === "ended") {
    return state.winner === rootSide ? WIN_SCORE : -WIN_SCORE;
  }

  const opponent = opponentOf(rootSide);
  let score = 0;
  score += evaluateSide(state, nowMs, rootSide, profile);
  score -= evaluateSide(state, nowMs, opponent, profile);

  if (isKingInDanger(state, rootSide, nowMs)) {
    score -= KING_DANGER_SCORE;
  }
  if (isKingInDanger(state, opponent, nowMs)) {
    score += KING_DANGER_SCORE * 0.7;
  }

  return score;
}

function evaluateSide(
  state: GameState,
  nowMs: number,
  side: Side,
  profile: AiProfile,
): number {
  let score = 0;
  for (const piece of Object.values(state.pieces)) {
    if (!piece.alive || piece.side !== side) {
      continue;
    }
    score += PIECE_VALUE[piece.type];
    score += advancementScore(piece);
    if (isPieceAttackedBySide(state, piece.id, opponentOf(side), nowMs)) {
      const defended = isPieceAttackedBySide(state, piece.id, side, nowMs);
      score -= PIECE_VALUE[piece.type] * (piece.type === "king" ? 4 : defended ? 0.65 : 1.45);
      if (!defended && MINING_TYPES.has(piece.type) && mineAt(state, piece.position)) {
        score -= 520;
      }
    }
  }

  const activeMines = countActiveMines(state, side);
  const homeMines = countHomeMinesControlled(state, side);
  const opponentMines = countOpponentMinesControlled(state, side);
  const strategy = getStrategy(state, side, profile);
  score += activeMines * 1350;
  score += homeMines * 700;
  score += opponentMines * 2400;
  score += countOpponentBackRankBuildSquaresControlled(state, side, nowMs) * strategy.bottomRankWeight;
  score -= Math.max(0, strategy.homeMineTarget - homeMines) * 700;
  score -= Math.max(0, strategy.homeMineTarget - activeMines) * 1800;
  if (activeMines >= strategy.homeMineTarget) {
    score -= Math.max(0, strategy.opponentMineTarget - opponentMines) * 650;
  }
  score += Math.min(state.players[side].money, 110) * 5;
  score -= Math.max(0, state.players[side].money - 120) * (shouldBuildForEconomy(state, side, profile) ? 8 : 4);
  score -= blockedBuildSquarePenalty(state, side, profile);
  score -= bridgeMineBlockPenalty(state, side, profile);
  return score;
}

function actionToDecision(action: SearchAction): AiDecision {
  if (action.kind === "build") {
    return action.decision;
  }
  if (action.kind === "wait") {
    return { type: "wait", reason: "not_ready" };
  }
  return {
    type: "move",
    candidate: {
      ...action.candidate,
      score: action.score,
    },
    source: "heuristic",
    raw: "search",
  };
}

function applyBuildDecision(
  state: GameState,
  decision: AiBuildDecision,
  nowMs: number,
  profile: AiProfile,
): GameState {
  const actionTimeMs = Math.max(state.gameTimeMs, nowMs);
  if (
    state.status !== "running" ||
    state.players[decision.side].money < state.rules.unitCosts[decision.pieceType] ||
    !isLegalBuild(state, decision.side, decision.pieceType, decision.at)
  ) {
    return scheduleNextAction(state, actionTimeMs, profile);
  }

  return scheduleNextAction(
    buildPiece(state, decision.side, decision.pieceType, decision.at, actionTimeMs),
    actionTimeMs,
    profile,
  );
}

function applyMoveDecision(
  state: GameState,
  decision: AiMoveDecision | AiWaitDecision,
  side: Side,
  requestedAtMs: number,
  profile: AiProfile,
): GameState {
  const actionTimeMs = Math.max(state.gameTimeMs, requestedAtMs);
  if (state.status !== "running") {
    return state;
  }
  if (decision.type === "wait") {
    return scheduleNextAction(state, actionTimeMs, profile);
  }

  const piece = state.pieces[decision.candidate.pieceId];
  if (
    !piece ||
    !piece.alive ||
    piece.side !== side ||
    actionTimeMs < piece.cooldownUntilMs ||
    !sameCoord(piece.position, decision.candidate.from) ||
    !isLegalMove(state, piece, decision.candidate.to)
  ) {
    return scheduleNextAction(state, actionTimeMs, profile);
  }

  return scheduleNextAction(
    movePiece(state, decision.candidate.pieceId, decision.candidate.to, actionTimeMs, "ai"),
    actionTimeMs,
    profile,
  );
}

function scheduleNextAction(state: GameState, nowMs: number, profile: AiProfile): GameState {
  return {
    ...state,
    gameTimeMs: nowMs,
    aiNextActionAtMs: nowMs + profile.actionIntervalMs,
  };
}

function simulateAction(state: GameState, action: SearchAction, nowMs: number): GameState {
  if (action.kind === "move") {
    return simulateMove(state, action.candidate, nowMs);
  }
  if (action.kind === "build") {
    return simulateBuild(state, action.decision, nowMs);
  }
  return { ...state, gameTimeMs: nowMs };
}

function simulateMove(state: GameState, candidate: AiMoveCandidate, nowMs: number): GameState {
  const piece = state.pieces[candidate.pieceId];
  if (!piece || !piece.alive || !isLegalMove(state, piece, candidate.to)) {
    return state;
  }
  const target = pieceAt(state, candidate.to);
  const pieces = { ...state.pieces };
  if (target) {
    pieces[target.id] = { ...target, alive: false };
  }
  pieces[piece.id] = {
    ...piece,
    position: { ...candidate.to },
    cooldownUntilMs: nowMs + state.rules.moveCooldownMs[piece.type],
  };
  return {
    ...state,
    gameTimeMs: nowMs,
    pieces,
    status: target?.type === "king" ? "ended" : state.status,
    winner: target?.type === "king" ? piece.side : state.winner,
  };
}

function simulateBuild(state: GameState, decision: AiBuildDecision, nowMs: number): GameState {
  if (
    !isLegalBuild(state, decision.side, decision.pieceType, decision.at) ||
    state.players[decision.side].money < state.rules.unitCosts[decision.pieceType]
  ) {
    return state;
  }
  const id = `search-${decision.side}-${decision.pieceType}-${Object.keys(state.pieces).length}`;
  return {
    ...state,
    gameTimeMs: nowMs,
    pieces: {
      ...state.pieces,
      [id]: {
        id,
        side: decision.side,
        type: decision.pieceType,
        position: { ...decision.at },
        alive: true,
        createdAtMs: nowMs,
        cooldownUntilMs: nowMs + state.rules.moveCooldownMs[decision.pieceType],
      },
    },
    players: {
      ...state.players,
      [decision.side]: {
        ...state.players[decision.side],
        money: state.players[decision.side].money - state.rules.unitCosts[decision.pieceType],
      },
    },
  };
}

function isTacticalAction(action: SearchAction, state: GameState, nowMs: number, side: Side): boolean {
  if (isKingInDanger(state, side, nowMs)) {
    return true;
  }
  if (action.kind === "build" || action.kind === "wait") {
    return false;
  }
  return action.candidate.reason === "win" || action.candidate.reason === "capture";
}

function actionWins(action: SearchAction): boolean {
  return action.kind === "move" && action.candidate.reason === "win";
}

function findKingThreats(state: GameState, side: Side, nowMs: number): PieceState[] {
  const king = findKing(state, side);
  if (!king) {
    return [];
  }
  return Object.values(state.pieces).filter((piece) => {
    if (!piece.alive || piece.side === side || nowMs < piece.cooldownUntilMs) {
      return false;
    }
    return legalMovesForPiece(state, piece).some((move) => sameCoord(move, king.position));
  });
}

function isKingInDanger(state: GameState, side: Side, nowMs: number): boolean {
  return findKingThreats(state, side, nowMs).length > 0;
}

function findKing(state: GameState, side: Side): PieceState | undefined {
  return Object.values(state.pieces).find(
    (piece) => piece.alive && piece.side === side && piece.type === "king",
  );
}

function isPieceAttackedBySide(
  state: GameState,
  pieceId: string,
  attackerSide: Side,
  nowMs: number,
): boolean {
  const target = state.pieces[pieceId];
  if (!target?.alive) {
    return false;
  }
  return Object.values(state.pieces).some((piece) => {
    if (!piece.alive || piece.side !== attackerSide || nowMs < piece.cooldownUntilMs) {
      return false;
    }
    return legalMovesForPiece(state, piece).some((move) => sameCoord(move, target.position));
  });
}

function isPieceThreatenedBeforeReady(
  state: GameState,
  pieceId: string,
  attackerSide: Side,
): boolean {
  const target = state.pieces[pieceId];
  if (!target?.alive) {
    return false;
  }
  return Object.values(state.pieces).some((piece) => {
    if (!piece.alive || piece.side !== attackerSide || piece.id === pieceId) {
      return false;
    }
    if (piece.cooldownUntilMs > target.cooldownUntilMs) {
      return false;
    }
    return legalMovesForPiece(state, piece).some((move) => sameCoord(move, target.position));
  });
}

function moveCreatesKingThreat(state: GameState, piece: PieceState, to: Coord): boolean {
  const enemyKing = findKing(state, opponentOf(piece.side));
  if (!enemyKing) {
    return false;
  }
  if (sameCoord(to, enemyKing.position)) {
    return true;
  }
  const target = pieceAt(state, to);
  const movedPiece = { ...piece, position: to };
  const pieces = { ...state.pieces, [piece.id]: movedPiece };
  if (target) {
    pieces[target.id] = { ...target, alive: false };
  }
  return isLegalMove({ ...state, pieces }, movedPiece, enemyKing.position);
}

function isBuildUnblockMove(state: GameState, piece: PieceState, to: Coord): boolean {
  if (mineAt(state, piece.position) && MINING_TYPES.has(piece.type)) {
    return false;
  }
  if (pieceAt(state, to)?.side === piece.side) {
    return false;
  }
  return COMBAT_BUILD_TYPES.some((type) =>
    buildSquares(piece.side, type).some((coord) => sameCoord(coord, piece.position)),
  );
}

function shouldBuildForEconomy(state: GameState, side: Side, profile: AiProfile): boolean {
  const activeMines = countActiveMines(state, side);
  const homeMines = countHomeMinesControlled(state, side);
  const opponentMines = countOpponentMinesControlled(state, side);
  const expansionPawnFiles = countExpansionPawnFiles(state, side);
  const strategy = getStrategy(state, side, profile);
  if (homeMines < strategy.homeMineTarget) {
    return true;
  }
  if (activeMines < strategy.totalMineTarget && expansionPawnFiles < 3) {
    return true;
  }
  return opponentMines < strategy.opponentMineTarget && expansionPawnFiles < 3;
}

function blockedBuildSquarePenalty(state: GameState, side: Side, profile: AiProfile): number {
  let penalty = 0;
  for (const type of COMBAT_BUILD_TYPES) {
    if (!shouldBuildPieceType(state, side, type, profile)) {
      continue;
    }
    if (state.players[side].money < state.rules.unitCosts[type]) {
      continue;
    }
    const squares = buildSquares(side, type);
    if (squares.some((coord) => isLegalBuild(state, side, type, coord))) {
      continue;
    }
    if (squares.some((coord) => pieceAt(state, coord)?.side === side)) {
      penalty += 360;
    }
  }
  return penalty;
}

function bridgeMineBlockPenalty(state: GameState, side: Side, profile: AiProfile): number {
  const strategy = getStrategy(state, side, profile);
  if (countOpponentMinesControlled(state, side) >= strategy.opponentMineTarget) {
    return 0;
  }
  const expansionPawnFiles = countExpansionPawnFiles(state, side);
  return Object.values(state.pieces).reduce((penalty, piece) => {
    if (
      !piece.alive ||
      piece.side !== side ||
      piece.type === "pawn" ||
      !MINING_TYPES.has(piece.type) ||
      !isBridgeMine(piece.position, side) ||
      isOpponentSideMine(piece.position, side) ||
      (!hasPawnBehindBridge(state, side, piece.position) && expansionPawnFiles >= 3)
    ) {
      return penalty;
    }
    return penalty + (hasPawnBehindBridge(state, side, piece.position) ? 3400 : 2600);
  }, 0);
}

function isUsefulMiningBuildSquare(
  state: GameState,
  side: Side,
  pieceType: BuildPieceType,
  at: Coord,
  profile: AiProfile,
): boolean {
  const strategy = getStrategy(state, side, profile);
  if (mineAt(state, at)) {
    return true;
  }
  if (pieceType === "pawn") {
    if (!EXPANSION_PAWN_FILES.has(at.x)) {
      return false;
    }
    if (!hasPawnOnFile(state, side, at.x)) {
      return true;
    }
    return (
      countExpansionPawnFiles(state, side) >= 3 &&
      countActiveMines(state, side) < strategy.totalMineTarget &&
      !hasPawnBehindBridge(state, side, homePawnMineCoord(side, at.x))
    );
  }
  if (pieceType === "elephant") {
    return distanceToNearestUsefulMine(state, side, at) <= 2;
  }
  return false;
}

function isMiningMove(state: GameState, piece: PieceState, to: Coord): boolean {
  if (!MINING_TYPES.has(piece.type)) {
    return false;
  }
  if (mineAt(state, piece.position) && !mineAt(state, to)) {
    return false;
  }
  if (mineAt(state, to) && !isOpponentSideMine(to, piece.side)) {
    return true;
  }
  return distanceToNearestUsefulMine(state, piece.side, to) < distanceToNearestUsefulMine(state, piece.side, piece.position);
}

function isEnemyMineMove(state: GameState, piece: PieceState, to: Coord): boolean {
  if (piece.type !== "pawn") {
    return false;
  }
  if (mineAt(state, to) && isOpponentSideMine(to, piece.side)) {
    return true;
  }
  return (
    distanceToNearestOpponentMine(state, piece.side, to) <
      distanceToNearestOpponentMine(state, piece.side, piece.position) &&
    forwardProgress(piece.side, piece.position, to) >= 0
  );
}

function countActiveMines(state: GameState, side: Side): number {
  return Object.values(state.pieces).filter(
    (piece) =>
      piece.alive &&
      piece.side === side &&
      MINING_TYPES.has(piece.type) &&
      Boolean(mineAt(state, piece.position)),
  ).length;
}

function countHomeMinesControlled(state: GameState, side: Side): number {
  return Object.values(state.pieces).filter(
    (piece) =>
      piece.alive &&
      piece.side === side &&
      MINING_TYPES.has(piece.type) &&
      mineAt(state, piece.position) &&
      !isOpponentSideMine(piece.position, side),
  ).length;
}

function countOpponentMinesControlled(state: GameState, side: Side): number {
  return Object.values(state.pieces).filter(
    (piece) =>
      piece.alive &&
      piece.side === side &&
      MINING_TYPES.has(piece.type) &&
      mineAt(state, piece.position) &&
      isOpponentSideMine(piece.position, side),
  ).length;
}

function countExpansionPawnFiles(state: GameState, side: Side): number {
  const files = new Set<number>();
  for (const piece of Object.values(state.pieces)) {
    if (piece.alive && piece.side === side && piece.type === "pawn" && EXPANSION_PAWN_FILES.has(piece.position.x)) {
      files.add(piece.position.x);
    }
  }
  return files.size;
}

function countOpponentBackRankBuildSquaresControlled(state: GameState, side: Side, nowMs: number): number {
  const opponent = opponentOf(side);
  const squares = [...buildSquares(opponent, "rook"), ...buildSquares(opponent, "horse")];
  const uniqueSquares = squares.filter(
    (square, index) => squares.findIndex((other) => sameCoord(other, square)) === index,
  );
  return uniqueSquares.filter((square) => isSquareControlledBySide(state, side, square, nowMs)).length;
}

function isSquareControlledBySide(state: GameState, side: Side, coord: Coord, nowMs: number): boolean {
  const occupant = pieceAt(state, coord);
  if (occupant?.side === side) {
    return true;
  }
  return Object.values(state.pieces).some((piece) => {
    if (!piece.alive || piece.side !== side || nowMs < piece.cooldownUntilMs) {
      return false;
    }
    return legalMovesForPiece(state, piece).some((move) => sameCoord(move, coord));
  });
}

function hasPawnOnFile(state: GameState, side: Side, file: number): boolean {
  return Object.values(state.pieces).some(
    (piece) => piece.alive && piece.side === side && piece.type === "pawn" && piece.position.x === file,
  );
}

function hasPawnBehindBridge(state: GameState, side: Side, bridge: Coord): boolean {
  return Object.values(state.pieces).some((piece) => {
    if (!piece.alive || piece.side !== side || piece.type !== "pawn" || piece.position.x !== bridge.x) {
      return false;
    }
    return side === "red" ? piece.position.y < bridge.y : piece.position.y > bridge.y;
  });
}

function homePawnMineCoord(side: Side, file: number): Coord {
  if (file === 4) {
    return { x: file, y: side === "red" ? 3 : 6 };
  }
  return { x: file, y: side === "red" ? 4 : 5 };
}

function countAlivePieces(state: GameState, side: Side, type: PieceType): number {
  return Object.values(state.pieces).filter(
    (piece) => piece.alive && piece.side === side && piece.type === type,
  ).length;
}

function isCombatPieceType(type: PieceType): boolean {
  return type === "rook" || type === "horse" || type === "cannon";
}

function distanceToNearestUsefulMine(state: GameState, side: Side, coord: Coord): number {
  const mines = Object.values(state.mines).filter(
    (mine) => !isMineControlledBySide(state, mine.position, side) && !isOpponentSideMine(mine.position, side),
  );
  const usefulMines = mines.length > 0 ? mines : Object.values(state.mines);
  return Math.min(
    ...usefulMines.map((mine) => Math.abs(mine.position.x - coord.x) + Math.abs(mine.position.y - coord.y)),
  );
}

function distanceToNearestOpponentMine(state: GameState, side: Side, coord: Coord): number {
  const mines = Object.values(state.mines).filter((mine) => isOpponentSideMine(mine.position, side));
  return Math.min(
    ...mines.map((mine) => Math.abs(mine.position.x - coord.x) + Math.abs(mine.position.y - coord.y)),
  );
}

function distanceToOpponentKing(state: GameState, coord: Coord, side: Side): number {
  const king = findKing(state, opponentOf(side));
  if (!king) {
    return 0;
  }
  return Math.abs(king.position.x - coord.x) + Math.abs(king.position.y - coord.y);
}

function isMineControlledBySide(state: GameState, coord: Coord, side: Side): boolean {
  const occupant = pieceAt(state, coord);
  return Boolean(occupant && occupant.side === side && MINING_TYPES.has(occupant.type));
}

function isOpponentSideMine(coord: Coord, side: Side): boolean {
  return side === "red" ? coord.y >= 5 : coord.y <= 4;
}

function isBridgeMine(coord: Coord, _side: Side): boolean {
  return BRIDGE_MINE_FILES.has(coord.x) && (coord.y === 4 || coord.y === 5);
}

function isOpponentHalf(coord: Coord, side: Side): boolean {
  return side === "red" ? coord.y >= 5 : coord.y <= 4;
}

function opponentOf(side: Side): Side {
  return side === "red" ? "black" : "red";
}

function forwardProgress(side: Side, from: Coord, to: Coord): number {
  return side === "red" ? to.y - from.y : from.y - to.y;
}

function advancementScore(piece: PieceState): number {
  if (piece.type === "king" || piece.type === "advisor" || piece.type === "elephant") {
    return 0;
  }
  const progress = piece.side === "red" ? piece.position.y : 9 - piece.position.y;
  return progress * (isCombatPieceType(piece.type) ? 24 : 32);
}
