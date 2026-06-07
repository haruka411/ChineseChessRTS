export type Side = "red" | "black";

export type PieceType =
  | "king"
  | "advisor"
  | "elephant"
  | "rook"
  | "horse"
  | "cannon"
  | "pawn";

export type Coord = {
  x: number;
  y: number;
};

export type PieceState = {
  id: string;
  side: Side;
  type: PieceType;
  position: Coord;
  alive: boolean;
  createdAtMs: number;
  cooldownUntilMs: number;
};

export type PlayerState = {
  side: Side;
  money: number;
};

export type MineState = {
  id: string;
  position: Coord;
  baseIncome: number;
  intervalMs: number;
  nextIncomeAtMs: number;
};

export type GameEventType =
  | "game_start"
  | "move"
  | "build"
  | "income"
  | "game_end"
  | "command_failed";

export type GameEvent = {
  id: string;
  gameTimeMs: number;
  actor: Side | "system" | "ai";
  type: GameEventType;
  messageKey: string;
  messageArgs?: Record<string, string | number>;
};

export type RuleConfig = {
  initialMoney: number;
  unitCosts: Record<Exclude<PieceType, "king">, number>;
  moveCooldownMs: Record<PieceType, number>;
  mineIncome: {
    intervalMs: number;
    amount: number;
  };
  allowCheckmateWin: false;
  requireKingCapture: true;
  allowBuildKing: false;
  supportedLocales: ["zh-CN", "zh-TW", "en-US"];
  defaultLocale: "zh-CN" | "zh-TW" | "en-US";
};

export type GameState = {
  gameId: string;
  status: "ready" | "running" | "paused" | "ended";
  gameTimeMs: number;
  pieces: Record<string, PieceState>;
  players: Record<Side, PlayerState>;
  mines: Record<string, MineState>;
  events: GameEvent[];
  rules: RuleConfig;
  winner?: Side;
  aiNextActionAtMs: number;
};

export type Locale = "zh-CN" | "zh-TW" | "en-US";
