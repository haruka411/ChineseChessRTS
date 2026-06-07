import type {
  Coord,
  GameEvent,
  GameState,
  MineState,
  PieceState,
  PieceType,
  RuleConfig,
  Side,
} from "./types";

const BOARD_WIDTH = 9;
const BOARD_HEIGHT = 10;

export const RULES: RuleConfig = {
  initialMoney: 50,
  unitCosts: {
    pawn: 20,
    advisor: 20,
    elephant: 20,
    horse: 35,
    cannon: 35,
    rook: 50,
  },
  moveCooldownMs: {
    king: 4000,
    advisor: 4000,
    elephant: 6000,
    rook: 10000,
    horse: 8000,
    cannon: 8000,
    pawn: 6000,
  },
  mineIncome: {
    intervalMs: 10000,
    amount: 5,
  },
  allowCheckmateWin: false,
  requireKingCapture: true,
  allowBuildKing: false,
  supportedLocales: ["zh-CN", "zh-TW", "en-US"],
  defaultLocale: "en-US",
};

export const PIECE_VALUE: Record<PieceType, number> = {
  king: 10000,
  rook: 900,
  cannon: 450,
  horse: 400,
  elephant: 220,
  advisor: 220,
  pawn: 100,
};

export const MINING_TYPES = new Set<PieceType>([
  "advisor",
  "elephant",
  "king",
  "pawn",
]);

const redFileNames = ["九", "八", "七", "六", "五", "四", "三", "二", "一"];
const chineseStepNames = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

let eventCounter = 0;
let pieceCounter = 0;

export function createInitialGame(): GameState {
  eventCounter = 0;
  pieceCounter = 0;

  const pieces: Record<string, PieceState> = {};
  const addPiece = (side: Side, type: PieceType, x: number, y: number) => {
    const id = `${side}-${type}-${pieceCounter++}`;
    pieces[id] = {
      id,
      side,
      type,
      position: { x, y },
      alive: true,
      createdAtMs: 0,
      cooldownUntilMs: 0,
    };
  };

  addPiece("black", "king", 4, 9);
  addPiece("black", "advisor", 4, 8);
  addPiece("black", "elephant", 4, 7);
  addPiece("red", "elephant", 4, 2);
  addPiece("red", "advisor", 4, 1);
  addPiece("red", "king", 4, 0);

  const mines = createMines();

  return {
    gameId: crypto.randomUUID(),
    status: "running",
    gameTimeMs: 0,
    pieces,
    players: {
      red: { side: "red", money: RULES.initialMoney },
      black: { side: "black", money: RULES.initialMoney },
    },
    mines,
    events: [
      createEvent(0, "system", "game_start", "event.gameStart", {}),
    ],
    rules: RULES,
    aiNextActionAtMs: 1000,
  };
}

function createMines(): Record<string, MineState> {
  const defs: Array<[string, Coord]> = [
    ["mine-red-palace-center", { x: 4, y: 1 }],
    ["mine-black-palace-center", { x: 4, y: 8 }],
    ["mine-red-king-home", { x: 4, y: 0 }],
    ["mine-black-king-home", { x: 4, y: 9 }],
    ["mine-red-center-pawn", { x: 4, y: 3 }],
    ["mine-black-center-pawn", { x: 4, y: 6 }],
    ["mine-red-elephant-river-left", { x: 2, y: 4 }],
    ["mine-red-elephant-river-right", { x: 6, y: 4 }],
    ["mine-black-elephant-river-left", { x: 2, y: 5 }],
    ["mine-black-elephant-river-right", { x: 6, y: 5 }],
  ];

  return Object.fromEntries(
    defs.map(([id, position]) => [
      id,
      {
        id,
        position,
        baseIncome: RULES.mineIncome.amount,
        intervalMs: RULES.mineIncome.intervalMs,
        nextIncomeAtMs: RULES.mineIncome.intervalMs,
      },
    ]),
  );
}

export function advanceEconomy(state: GameState, nowMs: number): GameState {
  if (state.status !== "running") {
    return { ...state, gameTimeMs: nowMs };
  }

  let changed = false;
  const players = { ...state.players };
  const mines = { ...state.mines };
  const events = [...state.events];

  for (const mine of Object.values(state.mines)) {
    if (nowMs < mine.nextIncomeAtMs) {
      continue;
    }

    const nextMine = { ...mine };
    while (nowMs >= nextMine.nextIncomeAtMs) {
      const miner = pieceAt(state, nextMine.position);
      if (miner && MINING_TYPES.has(miner.type)) {
        players[miner.side] = {
          ...players[miner.side],
          money: players[miner.side].money + nextMine.baseIncome,
        };
        events.unshift(
          createEvent(nowMs, miner.side, "income", "event.income", {
            side: miner.side,
            amount: nextMine.baseIncome,
            mine: mineLabel(nextMine.position),
          }),
        );
        changed = true;
      }
      nextMine.nextIncomeAtMs += nextMine.intervalMs;
    }
    mines[mine.id] = nextMine;
  }

  if (!changed) {
    return { ...state, gameTimeMs: nowMs, mines };
  }

  return trimEvents({ ...state, gameTimeMs: nowMs, players, mines, events });
}

export function movePiece(
  state: GameState,
  pieceId: string,
  to: Coord,
  nowMs: number,
  actor: Side | "ai",
): GameState {
  const piece = state.pieces[pieceId];
  if (!piece || !piece.alive || state.status !== "running") {
    return state;
  }

  if (nowMs < piece.cooldownUntilMs) {
    return appendFailure(state, nowMs, actor, "event.failedCooldown");
  }

  if (!isLegalMove(state, piece, to)) {
    return appendFailure(state, nowMs, actor, "event.failedIllegal");
  }

  const target = pieceAt(state, to);
  const pieces = { ...state.pieces };
  if (target) {
    pieces[target.id] = { ...target, alive: false };
  }

  pieces[piece.id] = {
    ...piece,
    position: to,
    cooldownUntilMs: nowMs + state.rules.moveCooldownMs[piece.type],
  };

  const notation = traditionalNotation(state, piece, to);
  const winner = target?.type === "king" ? piece.side : undefined;
  const nextState: GameState = {
    ...state,
    gameTimeMs: nowMs,
    pieces,
    status: winner ? "ended" : state.status,
    winner,
    events: [
      createEvent(nowMs, actor, "move", target ? "event.capture" : "event.move", {
        side: piece.side,
        piece: pieceNameKey(piece.type),
        notation,
        target: target ? pieceNameKey(target.type) : "",
      }),
      ...(winner
        ? [
            createEvent(nowMs, "system", "game_end", "event.gameEnd", {
              winner,
            }),
          ]
        : []),
      ...state.events,
    ],
  };

  return trimEvents(nextState);
}

export function buildPiece(
  state: GameState,
  side: Side,
  type: Exclude<PieceType, "king">,
  at: Coord,
  nowMs: number,
): GameState {
  if (state.status !== "running") {
    return state;
  }

  if (!isLegalBuild(state, side, type, at)) {
    return appendFailure(state, nowMs, side, "event.failedIllegal");
  }

  const cost = state.rules.unitCosts[type];
  if (state.players[side].money < cost) {
    return appendFailure(state, nowMs, side, "event.failedMoney");
  }

  const id = `${side}-${type}-${pieceCounter++}`;
  const pieces = {
    ...state.pieces,
    [id]: {
      id,
      side,
      type,
      position: at,
      alive: true,
      createdAtMs: nowMs,
      cooldownUntilMs: nowMs + state.rules.moveCooldownMs[type],
    },
  };
  const players = {
    ...state.players,
    [side]: {
      ...state.players[side],
      money: state.players[side].money - cost,
    },
  };

  return trimEvents({
    ...state,
    gameTimeMs: nowMs,
    pieces,
    players,
    events: [
      createEvent(nowMs, side, "build", "event.build", {
        side,
        piece: pieceNameKey(type),
        at: mineLabel(at),
        cost,
      }),
      ...state.events,
    ],
  });
}

export function isLegalBuild(
  state: GameState,
  side: Side,
  type: Exclude<PieceType, "king">,
  at: Coord,
): boolean {
  if (!isInsideBoard(at) || pieceAt(state, at)) {
    return false;
  }
  return buildSquares(side, type).some((coord) => sameCoord(coord, at));
}

export function buildSquares(side: Side, type: Exclude<PieceType, "king">): Coord[] {
  if (side === "red") {
    switch (type) {
      case "rook":
        return [{ x: 0, y: 0 }, { x: 8, y: 0 }];
      case "horse":
        return [{ x: 1, y: 0 }, { x: 7, y: 0 }];
      case "cannon":
        return [{ x: 1, y: 2 }, { x: 7, y: 2 }];
      case "pawn":
        return [0, 2, 4, 6, 8].map((x) => ({ x, y: 3 }));
      case "advisor":
        return [
          { x: 3, y: 0 },
          { x: 5, y: 0 },
          { x: 4, y: 1 },
          { x: 3, y: 2 },
          { x: 5, y: 2 },
        ];
      case "elephant":
        return [
          { x: 2, y: 0 },
          { x: 6, y: 0 },
          { x: 0, y: 2 },
          { x: 4, y: 2 },
          { x: 8, y: 2 },
          { x: 2, y: 4 },
          { x: 6, y: 4 },
        ];
    }
  }

  switch (type) {
    case "rook":
      return [{ x: 0, y: 9 }, { x: 8, y: 9 }];
    case "horse":
      return [{ x: 1, y: 9 }, { x: 7, y: 9 }];
    case "cannon":
      return [{ x: 1, y: 7 }, { x: 7, y: 7 }];
    case "pawn":
      return [0, 2, 4, 6, 8].map((x) => ({ x, y: 6 }));
    case "advisor":
      return [
        { x: 3, y: 9 },
        { x: 5, y: 9 },
        { x: 4, y: 8 },
        { x: 3, y: 7 },
        { x: 5, y: 7 },
      ];
    case "elephant":
      return [
        { x: 2, y: 9 },
        { x: 6, y: 9 },
        { x: 0, y: 7 },
        { x: 4, y: 7 },
        { x: 8, y: 7 },
        { x: 2, y: 5 },
        { x: 6, y: 5 },
      ];
  }
}

export function legalMovesForPiece(state: GameState, piece: PieceState): Coord[] {
  const moves: Coord[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const to = { x, y };
      if (isLegalMove(state, piece, to)) {
        moves.push(to);
      }
    }
  }
  return moves;
}

export function isLegalMove(state: GameState, piece: PieceState, to: Coord): boolean {
  if (!piece.alive || !isInsideBoard(to) || sameCoord(piece.position, to)) {
    return false;
  }

  const target = pieceAt(state, to);
  if (target?.side === piece.side) {
    return false;
  }

  const dx = to.x - piece.position.x;
  const dy = to.y - piece.position.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  let legal = false;
  switch (piece.type) {
    case "rook":
      legal = (dx === 0 || dy === 0) && countPiecesBetween(state, piece.position, to) === 0;
      break;
    case "cannon": {
      const between = countPiecesBetween(state, piece.position, to);
      legal = (dx === 0 || dy === 0) && (target ? between === 1 : between === 0);
      break;
    }
    case "horse": {
      const leg =
        adx === 2 && ady === 1
          ? { x: piece.position.x + Math.sign(dx), y: piece.position.y }
          : adx === 1 && ady === 2
            ? { x: piece.position.x, y: piece.position.y + Math.sign(dy) }
            : undefined;
      legal = Boolean(leg && !pieceAt(state, leg));
      break;
    }
    case "elephant": {
      const eye = { x: piece.position.x + dx / 2, y: piece.position.y + dy / 2 };
      const staysOwnSide = piece.side === "red" ? to.y <= 4 : to.y >= 5;
      legal = adx === 2 && ady === 2 && staysOwnSide && !pieceAt(state, eye);
      break;
    }
    case "advisor":
      legal = adx === 1 && ady === 1 && inPalace(piece.side, to);
      break;
    case "king": {
      const flyingKingCapture =
        target?.type === "king" &&
        dx === 0 &&
        countPiecesBetween(state, piece.position, to) === 0;
      legal = flyingKingCapture || (adx + ady === 1 && inPalace(piece.side, to));
      break;
    }
    case "pawn": {
      const forward = piece.side === "red" ? 1 : -1;
      const crossed = piece.side === "red" ? piece.position.y >= 5 : piece.position.y <= 4;
      legal = dx === 0 && dy === forward;
      if (crossed) {
        legal = legal || (ady === 0 && adx === 1);
      }
      break;
    }
  }

  if (!legal) {
    return false;
  }

  return true;
}

export function pieceAt(state: GameState, coord: Coord): PieceState | undefined {
  return Object.values(state.pieces).find(
    (piece) => piece.alive && sameCoord(piece.position, coord),
  );
}

export function mineAt(state: GameState, coord: Coord): MineState | undefined {
  return Object.values(state.mines).find((mine) => sameCoord(mine.position, coord));
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isInsideBoard(coord: Coord): boolean {
  return coord.x >= 0 && coord.x < BOARD_WIDTH && coord.y >= 0 && coord.y < BOARD_HEIGHT;
}

export function formatGameTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const millis = Math.floor(ms % 1000).toString().padStart(3, "0");
  return `${minutes}:${seconds}.${millis}`;
}

export function pieceNameKey(type: PieceType): string {
  return `piece.${type}`;
}

export function sideNameKey(side: Side): string {
  return `side.${side}`;
}

export function mineLabel(coord: Coord): string {
  return `(${coord.x},${coord.y})`;
}

function inPalace(side: Side, coord: Coord): boolean {
  if (coord.x < 3 || coord.x > 5) {
    return false;
  }
  return side === "red" ? coord.y >= 0 && coord.y <= 2 : coord.y >= 7 && coord.y <= 9;
}

function countPiecesBetween(state: GameState, from: Coord, to: Coord): number {
  if (from.x !== to.x && from.y !== to.y) {
    return Number.POSITIVE_INFINITY;
  }

  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  let count = 0;
  let x = from.x + stepX;
  let y = from.y + stepY;
  while (x !== to.x || y !== to.y) {
    if (pieceAt(state, { x, y })) {
      count++;
    }
    x += stepX;
    y += stepY;
  }
  return count;
}

function traditionalNotation(state: GameState, piece: PieceState, to: Coord): string {
  const pieceText = piece.side === "red" ? redPieceText[piece.type] : blackPieceText[piece.type];
  const pieceLabel = sameFilePieceLabel(state, piece, pieceText);
  const dy = to.y - piece.position.y;
  const forward = piece.side === "red" ? dy > 0 : dy < 0;
  const usesDestinationFile = piece.type === "horse" || piece.type === "elephant" || piece.type === "advisor";
  const action =
    usesDestinationFile || to.x === piece.position.x ? (forward ? "进" : "退") : "平";
  const destination = usesDestinationFile || action === "平"
    ? fileName(piece.side, to.x)
    : stepName(piece.side, Math.abs(dy));

  return `${pieceLabel}${action}${destination}`;
}

function sameFilePieceLabel(state: GameState, piece: PieceState, pieceText: string): string {
  const sameFilePieces = Object.values(state.pieces)
    .filter(
      (candidate) =>
        candidate.alive &&
        candidate.side === piece.side &&
        candidate.type === piece.type &&
        candidate.position.x === piece.position.x,
    )
    .sort((a, b) =>
      piece.side === "red"
        ? b.position.y - a.position.y
        : a.position.y - b.position.y,
    );

  if (sameFilePieces.length <= 1) {
    return `${pieceText}${fileName(piece.side, piece.position.x)}`;
  }

  const index = sameFilePieces.findIndex((candidate) => candidate.id === piece.id);
  return `${sameFileDisambiguator(index, sameFilePieces.length)}${pieceText}${fileName(piece.side, piece.position.x)}`;
}

function sameFileDisambiguator(index: number, total: number): string {
  if (index <= 0) {
    return "前";
  }
  if (index === total - 1) {
    return "后";
  }
  if (total === 3) {
    return "中";
  }
  return chineseStepNames[index + 1] ?? String(index + 1);
}

function fileName(side: Side, x: number): string {
  return side === "red" ? redFileNames[x] : String(x + 1);
}

function stepName(side: Side, steps: number): string {
  return side === "red" ? chineseStepNames[steps] : String(steps);
}

const redPieceText: Record<PieceType, string> = {
  king: "帅",
  advisor: "仕",
  elephant: "相",
  rook: "车",
  horse: "马",
  cannon: "炮",
  pawn: "兵",
};

const blackPieceText: Record<PieceType, string> = {
  king: "将",
  advisor: "士",
  elephant: "象",
  rook: "车",
  horse: "马",
  cannon: "炮",
  pawn: "卒",
};

function createEvent(
  gameTimeMs: number,
  actor: Side | "system" | "ai",
  type: GameEvent["type"],
  messageKey: string,
  messageArgs?: Record<string, string | number>,
): GameEvent {
  return {
    id: `event-${eventCounter++}`,
    gameTimeMs,
    actor,
    type,
    messageKey,
    messageArgs,
  };
}

function appendFailure(
  state: GameState,
  nowMs: number,
  actor: Side | "ai",
  messageKey: string,
): GameState {
  return trimEvents({
    ...state,
    gameTimeMs: nowMs,
    events: [createEvent(nowMs, actor, "command_failed", messageKey), ...state.events],
  });
}

function trimEvents(state: GameState): GameState {
  return {
    ...state,
    events: state.events.slice(0, 160),
  };
}
