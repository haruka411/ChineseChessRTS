import {
  advanceEconomy,
  buildSquares,
  createInitialGame,
  isLegalBuild,
  legalMovesForPiece,
  MINING_TYPES,
  mineAt,
  pieceAt,
  PIECE_VALUE,
  sameCoord,
} from "./rules";
import { chooseAiDecision, DEFAULT_AI_PROFILE, runAiStep } from "./ai";
import type { AiBenchSummary, AiProfile, AiStrategyMode } from "./aiTypes";
import type { GameEvent, GameState, PieceState, PieceType, Side } from "./types";

export type AiBenchOptions = {
  games?: number;
  maxGameTimeMs?: number;
  stepMs?: number;
};

export type AiScenarioCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

type GameCounters = {
  moves: number;
  builds: number;
  commandFailures: number;
  uncheckedKingThreats: number;
  hangingMoves: number;
};

export function runAiSelfPlay(options: AiBenchOptions = {}): AiBenchSummary {
  const games = options.games ?? 20;
  const maxGameTimeMs = options.maxGameTimeMs ?? 180000;
  const stepMs = options.stepMs ?? 250;
  const totals = {
    redWins: 0,
    blackWins: 0,
    draws: 0,
    gameTimeMs: 0,
    moves: 0,
    builds: 0,
    commandFailures: 0,
    uncheckedKingThreats: 0,
    hangingMoves: 0,
    redMinesAt60s: 0,
    blackMinesAt60s: 0,
    redOpponentMinesAt60s: 0,
    blackOpponentMinesAt60s: 0,
    redMoneyAt60s: 0,
    blackMoneyAt60s: 0,
    redEndMoney: 0,
    blackEndMoney: 0,
  };

  for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const result = runOneSelfPlayGame(maxGameTimeMs, stepMs, gameIndex);
    totals.redWins += result.winner === "red" ? 1 : 0;
    totals.blackWins += result.winner === "black" ? 1 : 0;
    totals.draws += result.winner ? 0 : 1;
    totals.gameTimeMs += result.gameTimeMs;
    totals.moves += result.moves;
    totals.builds += result.builds;
    totals.commandFailures += result.commandFailures;
    totals.uncheckedKingThreats += result.uncheckedKingThreats;
    totals.hangingMoves += result.hangingMoves;
    totals.redMinesAt60s += result.redMinesAt60s;
    totals.blackMinesAt60s += result.blackMinesAt60s;
    totals.redOpponentMinesAt60s += result.redOpponentMinesAt60s;
    totals.blackOpponentMinesAt60s += result.blackOpponentMinesAt60s;
    totals.redMoneyAt60s += result.redMoneyAt60s;
    totals.blackMoneyAt60s += result.blackMoneyAt60s;
    totals.redEndMoney += result.redEndMoney;
    totals.blackEndMoney += result.blackEndMoney;
  }

  return {
    games,
    redWins: totals.redWins,
    blackWins: totals.blackWins,
    draws: totals.draws,
    averageGameTimeMs: totals.gameTimeMs / games,
    averageFallbacks: 0,
    averageMoves: totals.moves / games,
    averageBuilds: totals.builds / games,
    averageRedMinesAt60s: totals.redMinesAt60s / games,
    averageBlackMinesAt60s: totals.blackMinesAt60s / games,
    averageRedOpponentMinesAt60s: totals.redOpponentMinesAt60s / games,
    averageBlackOpponentMinesAt60s: totals.blackOpponentMinesAt60s / games,
    averageRedMoneyAt60s: totals.redMoneyAt60s / games,
    averageBlackMoneyAt60s: totals.blackMoneyAt60s / games,
    averageCommandFailures: totals.commandFailures / games,
    averageUncheckedKingThreats: totals.uncheckedKingThreats / games,
    averageHangingMoves: totals.hangingMoves / games,
    averageRedEndMoney: totals.redEndMoney / games,
    averageBlackEndMoney: totals.blackEndMoney / games,
  };
}

export function runAiScenarioChecks(): AiScenarioCheck[] {
  return [
    checkImmediateKingCapture(),
    checkKingDefense(),
    checkBuildUnblock(),
    checkMiningBuild(),
    checkPassiveEconomyExpansion(),
    checkStrategyModeSpread(),
  ];
}

function runOneSelfPlayGame(
  maxGameTimeMs: number,
  stepMs: number,
  gameIndex: number,
): {
  winner?: Side;
  gameTimeMs: number;
  moves: number;
  builds: number;
  commandFailures: number;
  uncheckedKingThreats: number;
  hangingMoves: number;
  redMinesAt60s: number;
  blackMinesAt60s: number;
  redOpponentMinesAt60s: number;
  blackOpponentMinesAt60s: number;
  redMoneyAt60s: number;
  blackMoneyAt60s: number;
  redEndMoney: number;
  blackEndMoney: number;
} {
  let state = createInitialGame();
  const nextActionAt: Record<Side, number> = { red: 1000, black: 1000 };
  const counters: GameCounters = {
    moves: 0,
    builds: 0,
    commandFailures: 0,
    uncheckedKingThreats: 0,
    hangingMoves: 0,
  };
  let economySnapshot:
    | Record<Side, { mines: number; opponentMines: number; money: number }>
    | undefined;

  for (let nowMs = 0; nowMs <= maxGameTimeMs && state.status === "running"; nowMs += stepMs) {
    state = advanceEconomy(state, nowMs);
    if (!economySnapshot && nowMs >= 60000) {
      economySnapshot = snapshotEconomy(state);
    }
    for (const side of sideOrder(nowMs, gameIndex)) {
      if (nowMs < nextActionAt[side] || state.status !== "running") {
        continue;
      }
      const before = state;
      const wasInCheck = isKingInDanger(before, side, nowMs);
      state = runAiStep({ ...state, aiNextActionAtMs: 0 }, nowMs, side);
      recordActionCounters(before, state, side, nowMs, wasInCheck, counters);
      nextActionAt[side] = nowMs + 750;
    }
  }

  const finalSnapshot = snapshotEconomy(state);
  const snapshot = economySnapshot ?? finalSnapshot;
  return {
    winner: state.winner,
    gameTimeMs: state.gameTimeMs,
    ...counters,
    redMinesAt60s: snapshot.red.mines,
    blackMinesAt60s: snapshot.black.mines,
    redOpponentMinesAt60s: snapshot.red.opponentMines,
    blackOpponentMinesAt60s: snapshot.black.opponentMines,
    redMoneyAt60s: snapshot.red.money,
    blackMoneyAt60s: snapshot.black.money,
    redEndMoney: state.players.red.money,
    blackEndMoney: state.players.black.money,
  };
}

function recordActionCounters(
  before: GameState,
  after: GameState,
  side: Side,
  nowMs: number,
  wasInCheck: boolean,
  counters: GameCounters,
): void {
  const event = after.events[0];
  if (event && event.id !== before.events[0]?.id) {
    if (event.type === "move") {
      counters.moves++;
    }
    if (event.type === "build") {
      counters.builds++;
    }
    if (event.type === "command_failed") {
      counters.commandFailures++;
    }
  }

  if (
    wasInCheck &&
    hasLegalKingDefense(before, side, nowMs) &&
    after.status === "running" &&
    isKingInDanger(after, side, nowMs)
  ) {
    counters.uncheckedKingThreats++;
  }

  const movedPiece = findMovedPiece(before, after, side);
  if (movedPiece && isHangingMove(before, after, movedPiece, side, nowMs, event)) {
    counters.hangingMoves++;
  }
}

function hasLegalKingDefense(state: GameState, side: Side, nowMs: number): boolean {
  for (const piece of Object.values(state.pieces)) {
    if (!piece.alive || piece.side !== side || nowMs < piece.cooldownUntilMs) {
      continue;
    }
    for (const to of legalMovesForPiece(state, piece)) {
      if (!isKingInDanger(simulateBenchMove(state, piece, to, nowMs), side, nowMs)) {
        return true;
      }
    }
  }

  const buildTypes: Exclude<PieceType, "king">[] = ["pawn", "advisor", "elephant", "horse", "cannon", "rook"];
  for (const pieceType of buildTypes) {
    if (state.players[side].money < state.rules.unitCosts[pieceType]) {
      continue;
    }
    for (const at of buildSquares(side, pieceType)) {
      if (!isLegalBuild(state, side, pieceType, at)) {
        continue;
      }
      if (!isKingInDanger(simulateBenchBuild(state, side, pieceType, at, nowMs), side, nowMs)) {
        return true;
      }
    }
  }
  return false;
}

function simulateBenchMove(state: GameState, piece: PieceState, to: { x: number; y: number }, nowMs: number): GameState {
  const target = pieceAt(state, to);
  const pieces = { ...state.pieces };
  if (target) {
    pieces[target.id] = { ...target, alive: false };
  }
  pieces[piece.id] = {
    ...piece,
    position: { ...to },
    cooldownUntilMs: nowMs + state.rules.moveCooldownMs[piece.type],
  };
  return { ...state, pieces };
}

function simulateBenchBuild(
  state: GameState,
  side: Side,
  type: Exclude<PieceType, "king">,
  at: { x: number; y: number },
  nowMs: number,
): GameState {
  const id = `bench-${side}-${type}-${Object.keys(state.pieces).length}`;
  return {
    ...state,
    pieces: {
      ...state.pieces,
      [id]: {
        id,
        side,
        type,
        position: { ...at },
        alive: true,
        createdAtMs: nowMs,
        cooldownUntilMs: nowMs + state.rules.moveCooldownMs[type],
      },
    },
  };
}

function isHangingMove(
  before: GameState,
  after: GameState,
  movedPiece: PieceState,
  side: Side,
  nowMs: number,
  event?: GameEvent,
): boolean {
  if (movedPiece.type === "king" || !isPieceAttackedBySide(after, movedPiece.id, opponentOf(side), nowMs)) {
    return false;
  }
  if (isPieceAttackedBySide(after, movedPiece.id, side, nowMs)) {
    return false;
  }
  const capturedType = event?.messageArgs?.target;
  const capturedValue =
    typeof capturedType === "string"
      ? PIECE_VALUE[pieceKeyToType(capturedType) ?? "pawn"]
      : 0;
  return capturedValue < PIECE_VALUE[movedPiece.type] * 0.75 && !isKingInDanger(before, opponentOf(side), nowMs);
}

function findMovedPiece(before: GameState, after: GameState, side: Side): PieceState | undefined {
  return Object.values(after.pieces).find((piece) => {
    const previous = before.pieces[piece.id];
    return (
      piece.alive &&
      piece.side === side &&
      previous?.alive &&
      !sameCoord(piece.position, previous.position)
    );
  });
}

function checkImmediateKingCapture(): AiScenarioCheck {
  const state = withPieces(createInitialGame(), [
    ["red-advisor-4", false],
    ["red-elephant-3", false],
    ["black-elephant-2", false],
    ["black-rook-win", true, "black", "rook", { x: 4, y: 1 }],
  ]);
  const next = runAiStep({ ...state, aiNextActionAtMs: 0, gameTimeMs: 10000 }, 10000, "black");
  return {
    name: "immediate_king_capture",
    passed: next.status === "ended" && next.winner === "black",
    detail: next.events[0]?.messageKey ?? "no event",
  };
}

function checkKingDefense(): AiScenarioCheck {
  const state = withPieces(createInitialGame(), [
    ["black-advisor-1", false],
    ["black-elephant-2", false],
    ["red-rook-check", true, "red", "rook", { x: 4, y: 8 }],
  ]);
  const next = runAiStep({ ...state, aiNextActionAtMs: 0, gameTimeMs: 10000 }, 10000, "black");
  return {
    name: "king_defense",
    passed: next.status === "ended" || !isKingInDanger(next, "black", 10000),
    detail: next.events[0]?.messageKey ?? "no event",
  };
}

function checkBuildUnblock(): AiScenarioCheck {
  const state = withPieces(
    {
      ...createInitialGame(),
      gameTimeMs: 10000,
      players: {
        red: { side: "red", money: 50 },
        black: { side: "black", money: 120 },
      },
    },
    [
      ["black-block-left", true, "black", "pawn", { x: 0, y: 9 }],
      ["black-block-right", true, "black", "pawn", { x: 8, y: 9 }],
      ["black-mine-pawn", true, "black", "pawn", { x: 4, y: 6 }],
      ["black-mine-elephant", true, "black", "elephant", { x: 2, y: 5 }],
      ["black-mine-elephant-right", true, "black", "elephant", { x: 6, y: 5 }],
    ],
  );
  const decision = chooseAiDecision(state, 10000, "black");
  return {
    name: "build_unblock",
    passed: decision.type === "move" && decision.candidate.reason === "unblock",
    detail: decision.type,
  };
}

function checkMiningBuild(): AiScenarioCheck {
  const state = { ...createInitialGame(), gameTimeMs: 1000 };
  const decision = chooseAiDecision(state, 1000, "black");
  return {
    name: "mining_build",
    passed: decision.type === "build" && decision.reason === "mine",
    detail: decision.type === "build" ? `${decision.pieceType}@${decision.at.x},${decision.at.y}` : decision.type,
  };
}

function checkPassiveEconomyExpansion(): AiScenarioCheck {
  const economicProfile = withStrategy("economic");
  const red = runPassiveEconomyExpansion("red", economicProfile);
  const black = runPassiveEconomyExpansion("black", economicProfile);
  const passed =
    red.mines >= 6 &&
    black.mines >= 6 &&
    red.opponentMines >= 2 &&
    black.opponentMines >= 2 &&
    red.commandFailures === 0 &&
    black.commandFailures === 0;
  return {
    name: "passive_economy_expansion",
    passed,
    detail: `red ${red.mines}/${red.opponentMines} $${red.money}; black ${black.mines}/${black.opponentMines} $${black.money}`,
  };
}

function checkStrategyModeSpread(): AiScenarioCheck {
  const aggressive = runPassiveEconomyExpansion("black", withStrategy("aggressive"));
  const balanced = runPassiveEconomyExpansion("black", withStrategy("balanced"));
  const economic = runPassiveEconomyExpansion("black", withStrategy("economic"));
  const passed =
    aggressive.winner === "black" &&
    aggressive.mines <= 4 &&
    balanced.mines >= 5 &&
    balanced.opponentMines === 0 &&
    economic.opponentMines >= 2 &&
    economic.mines > balanced.mines;
  return {
    name: "strategy_mode_spread",
    passed,
    detail: `aggressive ${aggressive.mines}/${aggressive.opponentMines} ${aggressive.winner ?? "no-win"}; balanced ${balanced.mines}/${balanced.opponentMines}; economic ${economic.mines}/${economic.opponentMines}`,
  };
}

function runPassiveEconomyExpansion(
  side: Side,
  profile: AiProfile = DEFAULT_AI_PROFILE,
): { mines: number; opponentMines: number; money: number; commandFailures: number; winner?: Side } {
  let state = createInitialGame();
  let nextActionAt = 1000;
  let commandFailures = 0;
  for (let nowMs = 0; nowMs <= 60000 && state.status === "running"; nowMs += 250) {
    state = advanceEconomy(state, nowMs);
    if (nowMs < nextActionAt) {
      continue;
    }
    const before = state.events[0]?.id;
    state = runAiStep({ ...state, aiNextActionAtMs: 0 }, nowMs, side, profile);
    const event = state.events[0];
    if (event?.id !== before && event.type === "command_failed") {
      commandFailures++;
    }
    nextActionAt = nowMs + 750;
  }
  return {
    mines: countActiveMines(state, side),
    opponentMines: countOpponentMinesControlled(state, side),
    money: state.players[side].money,
    commandFailures,
    winner: state.winner,
  };
}

function withStrategy(strategyMode: AiStrategyMode): AiProfile {
  return { ...DEFAULT_AI_PROFILE, strategyMode };
}

function snapshotEconomy(
  state: GameState,
): Record<Side, { mines: number; opponentMines: number; money: number }> {
  return {
    red: {
      mines: countActiveMines(state, "red"),
      opponentMines: countOpponentMinesControlled(state, "red"),
      money: state.players.red.money,
    },
    black: {
      mines: countActiveMines(state, "black"),
      opponentMines: countOpponentMinesControlled(state, "black"),
      money: state.players.black.money,
    },
  };
}

function withPieces(
  state: GameState,
  edits: Array<[string, false] | [string, true, Side, PieceType, { x: number; y: number }]>,
): GameState {
  const pieces = { ...state.pieces };
  for (const edit of edits) {
    if (!edit[1]) {
      if (pieces[edit[0]]) {
        pieces[edit[0]] = { ...pieces[edit[0]], alive: false };
      }
      continue;
    }
    pieces[edit[0]] = {
      id: edit[0],
      side: edit[2],
      type: edit[3],
      position: edit[4],
      alive: true,
      createdAtMs: 0,
      cooldownUntilMs: 0,
    };
  }
  return { ...state, pieces };
}

function isKingInDanger(state: GameState, side: Side, nowMs: number): boolean {
  const king = Object.values(state.pieces).find(
    (piece) => piece.alive && piece.side === side && piece.type === "king",
  );
  if (!king) {
    return false;
  }
  return Object.values(state.pieces).some((piece) => {
    if (!piece.alive || piece.side === side || nowMs < piece.cooldownUntilMs) {
      return false;
    }
    return legalMovesForPiece(state, piece).some((move) => sameCoord(move, king.position));
  });
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

function countActiveMines(state: GameState, side: Side): number {
  return Object.values(state.pieces).filter(
    (piece) =>
      piece.alive &&
      piece.side === side &&
      MINING_TYPES.has(piece.type) &&
      Boolean(mineAt(state, piece.position)),
  ).length;
}

function countOpponentMinesControlled(state: GameState, side: Side): number {
  return Object.values(state.pieces).filter(
    (piece) =>
      piece.alive &&
      piece.side === side &&
      MINING_TYPES.has(piece.type) &&
      Boolean(mineAt(state, piece.position)) &&
      (side === "red" ? piece.position.y >= 5 : piece.position.y <= 4),
  ).length;
}

function pieceKeyToType(key: string): PieceType | undefined {
  const type = key.replace("piece.", "");
  return ["king", "advisor", "elephant", "rook", "horse", "cannon", "pawn"].includes(type)
    ? (type as PieceType)
    : undefined;
}

function sideOrder(nowMs: number, gameIndex: number): Side[] {
  const order: Side[] = Math.floor(nowMs / 250) % 2 === 0 ? ["red", "black"] : ["black", "red"];
  return gameIndex % 2 === 0 ? order : [...order].reverse();
}

function opponentOf(side: Side): Side {
  return side === "red" ? "black" : "red";
}
