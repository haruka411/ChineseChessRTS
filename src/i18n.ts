import type { GameEvent, Locale, PieceType, Side } from "./game/types";
import { formatGameTime } from "./game/rules";

type Messages = Record<string, string>;

const messages: Record<Locale, Messages> = {
  "zh-CN": {
    "app.title": "中国象棋 RTS",
    "app.subtitle": "实时移动、占矿、建造，吃掉将/帅获胜",
    "action.restart": "重新开始",
    "action.pause": "暂停",
    "action.resume": "继续",
    "label.language": "语言",
    "label.redMoney": "红方金钱",
    "label.blackMoney": "黑方金钱",
    "label.status": "状态",
    "label.running": "进行中",
    "label.paused": "已暂停",
    "label.ended": "已结束",
    "label.selected": "已选棋子",
    "label.cooldown": "冷却",
    "label.ready": "可操作",
    "label.build": "建造",
    "label.events": "事件日志",
    "label.ai": "黑方 AI",
    "label.mine": "矿点",
    "label.mining": "采矿",
    "label.piece": "兵种",
    "label.pieceStats": "棋子统计",
    "label.noEvents": "暂无走法记录",
    "label.rules": "游戏规则",
    "label.victory": "胜利条件",
    "label.realtime": "实时对战",
    "label.resources": "资源与建造",
    "label.movement": "棋子走法",
    "label.noSelection": "未选择",
    "label.buildMode": "建造模式",
    "label.cancelBuild": "取消建造",
    "label.winner": "{side}获胜",
    "start.chooseSide": "选择你的阵营",
    "start.ruleSummary": "双方实时对战，采集资源建造军队，实际吃掉对方将/帅获胜。",
    "side.red": "红方",
    "side.black": "黑方",
    "piece.king": "将/帅",
    "piece.advisor": "仕/士",
    "piece.elephant": "相/象",
    "piece.rook": "车",
    "piece.horse": "马",
    "piece.cannon": "炮",
    "piece.pawn": "兵/卒",
    "event.gameStart": "对局开始",
    "event.move": "{notation}",
    "event.capture": "{notation} 吃 {target}",
    "event.build": "建造：{piece}@{at}，花费 {cost}",
    "event.income": "矿点 {mine} +{amount}",
    "event.gameEnd": "{winner}获胜",
    "event.failedCooldown": "操作失败：棋子冷却中",
    "event.failedIllegal": "操作失败：非法位置",
    "event.failedMoney": "操作失败：金钱不足",
    "rule.victory": "必须实际吃掉对方将/帅才能获胜；没有将死、困毙或和棋判定。",
    "rule.realtime": "双方同时行动。移动或吃子后，该棋子进入独立冷却；棋子基本走法沿用中国象棋，但允许将帅照面。",
    "rule.resources": "初始金钱为 50。仕/士、相/象、将/帅、兵/卒站在矿点上，每 10 秒获得 5 金钱；建造出的棋子会立即进入移动冷却。",
    "rule.victory.capture": "实际吃掉对方将/帅立即获胜。",
    "rule.victory.noCheckmate": "没有将死、困毙或和棋判定。",
    "rule.realtime.simultaneous": "双方不分回合，同时行动。",
    "rule.realtime.cooldown": "移动或吃子后进入独立冷却。",
    "rule.realtime.standardMoves": "棋子基本走法沿用中国象棋，但本作允许将帅照面。",
    "rule.resources.start": "初始金钱为 50。",
    "rule.resources.mining": "可采矿棋子在矿点上每 10 秒获得 5 金钱。",
    "rule.resources.build": "建造消耗金钱，新棋子立即进入移动冷却。",
    "rule.resources.miners": "可采矿：仕/士、相/象、将/帅、兵/卒。",
    "rule.resources.income": "站在矿点上每 10 秒获得 5 金钱。",
    "rule.resources.buildPositions": "车、马、炮、兵/卒只能建在可能初始位置；仕/士、相/象建在本方规则可达点；将/帅不可建造。",
    "rule.resources.buildCooldown": "建造消耗金钱，新棋子立即进入移动冷却。",
    "rule.movement.kingAdvisor": "将/帅在九宫内横竖一格；仕/士在九宫内斜走一格。",
    "rule.movement.elephant": "相/象走田，不能过河，象眼有子时不能走。",
    "rule.movement.rookHorse": "车横竖直线无阻移动；马走日，受蹩马腿限制。",
    "rule.movement.cannon": "炮移动同车，吃子时必须隔一个炮架。",
    "rule.movement.pawn": "兵/卒过河前只能向前，过河后可向前或左右，不能后退。",
    "rule.movement.flyingKing": "本作允许将帅照面；白脸杀：同一路且中间无子时，可沿直线直接吃对方将/帅。",
  },
  "zh-TW": {
    "app.title": "中國象棋 RTS",
    "app.subtitle": "即時移動、佔礦、建造，吃掉將/帥獲勝",
    "action.restart": "重新開始",
    "action.pause": "暫停",
    "action.resume": "繼續",
    "label.language": "語言",
    "label.redMoney": "紅方金錢",
    "label.blackMoney": "黑方金錢",
    "label.status": "狀態",
    "label.running": "進行中",
    "label.paused": "已暫停",
    "label.ended": "已結束",
    "label.selected": "已選棋子",
    "label.cooldown": "冷卻",
    "label.ready": "可操作",
    "label.build": "建造",
    "label.events": "事件日誌",
    "label.ai": "黑方 AI",
    "label.mine": "礦點",
    "label.mining": "採礦",
    "label.piece": "兵種",
    "label.pieceStats": "棋子統計",
    "label.noEvents": "暫無走法記錄",
    "label.rules": "遊戲規則",
    "label.victory": "勝利條件",
    "label.realtime": "即時對戰",
    "label.resources": "資源與建造",
    "label.movement": "棋子走法",
    "label.noSelection": "未選擇",
    "label.buildMode": "建造模式",
    "label.cancelBuild": "取消建造",
    "label.winner": "{side}獲勝",
    "start.chooseSide": "選擇你的陣營",
    "start.ruleSummary": "雙方即時對戰，採集資源建造軍隊，實際吃掉對方將/帥獲勝。",
    "side.red": "紅方",
    "side.black": "黑方",
    "piece.king": "將/帥",
    "piece.advisor": "仕/士",
    "piece.elephant": "相/象",
    "piece.rook": "車",
    "piece.horse": "馬",
    "piece.cannon": "炮",
    "piece.pawn": "兵/卒",
    "event.gameStart": "對局開始",
    "event.move": "{notation}",
    "event.capture": "{notation} 吃 {target}",
    "event.build": "建造：{piece}@{at}，花費 {cost}",
    "event.income": "礦點 {mine} +{amount}",
    "event.gameEnd": "{winner}獲勝",
    "event.failedCooldown": "操作失敗：棋子冷卻中",
    "event.failedIllegal": "操作失敗：非法位置",
    "event.failedMoney": "操作失敗：金錢不足",
    "rule.victory": "必須實際吃掉對方將/帥才能獲勝；沒有將死、困斃或和棋判定。",
    "rule.realtime": "雙方同時行動。移動或吃子後，該棋子進入獨立冷卻；棋子基本走法沿用中國象棋，但允許將帥照面。",
    "rule.resources": "初始金錢為 50。仕/士、相/象、將/帥、兵/卒站在礦點上，每 10 秒獲得 5 金錢；建造出的棋子會立即進入移動冷卻。",
    "rule.victory.capture": "實際吃掉對方將/帥立即獲勝。",
    "rule.victory.noCheckmate": "沒有將死、困斃或和棋判定。",
    "rule.realtime.simultaneous": "雙方不分回合，同時行動。",
    "rule.realtime.cooldown": "移動或吃子後進入獨立冷卻。",
    "rule.realtime.standardMoves": "棋子基本走法沿用中國象棋，但本作允許將帥照面。",
    "rule.resources.start": "初始金錢為 50。",
    "rule.resources.mining": "可採礦棋子在礦點上每 10 秒獲得 5 金錢。",
    "rule.resources.build": "建造消耗金錢，新棋子立即進入移動冷卻。",
    "rule.resources.miners": "可採礦：仕/士、相/象、將/帥、兵/卒。",
    "rule.resources.income": "站在礦點上每 10 秒獲得 5 金錢。",
    "rule.resources.buildPositions": "車、馬、炮、兵/卒只能建在可能初始位置；仕/士、相/象建在本方規則可達點；將/帥不可建造。",
    "rule.resources.buildCooldown": "建造消耗金錢，新棋子立即進入移動冷卻。",
    "rule.movement.kingAdvisor": "將/帥在九宮內橫豎一格；仕/士在九宮內斜走一格。",
    "rule.movement.elephant": "相/象走田，不能過河，象眼有子時不能走。",
    "rule.movement.rookHorse": "車橫豎直線無阻移動；馬走日，受蹩馬腿限制。",
    "rule.movement.cannon": "炮移動同車，吃子時必須隔一個炮架。",
    "rule.movement.pawn": "兵/卒過河前只能向前，過河後可向前或左右，不能後退。",
    "rule.movement.flyingKing": "本作允許將帥照面；白臉殺：同一路且中間無子時，可沿直線直接吃對方將/帥。",
  },
  "en-US": {
    "app.title": "Chinese Chess RTS",
    "app.subtitle": "Real-time movement, mining, building, and king capture victory",
    "action.restart": "Restart",
    "action.pause": "Pause",
    "action.resume": "Resume",
    "label.language": "Language",
    "label.redMoney": "Red money",
    "label.blackMoney": "Black money",
    "label.status": "Status",
    "label.running": "Running",
    "label.paused": "Paused",
    "label.ended": "Ended",
    "label.selected": "Selected",
    "label.cooldown": "Cooldown",
    "label.ready": "Ready",
    "label.build": "Build",
    "label.events": "Event log",
    "label.ai": "Black AI",
    "label.mine": "Mine",
    "label.mining": "Mining",
    "label.piece": "Unit",
    "label.pieceStats": "Piece stats",
    "label.noEvents": "No moves yet",
    "label.rules": "Rules",
    "label.victory": "Victory",
    "label.realtime": "Real-time",
    "label.resources": "Resources & Build",
    "label.movement": "Movement",
    "label.noSelection": "None",
    "label.buildMode": "Build mode",
    "label.cancelBuild": "Cancel build",
    "label.winner": "{side} wins",
    "start.chooseSide": "Choose your side",
    "start.ruleSummary": "Fight in real time, mine resources, build an army, and win by actually capturing the opposing King.",
    "side.red": "Red",
    "side.black": "Black",
    "piece.king": "King",
    "piece.advisor": "Advisor",
    "piece.elephant": "Elephant",
    "piece.rook": "Rook",
    "piece.horse": "Horse",
    "piece.cannon": "Cannon",
    "piece.pawn": "Pawn",
    "event.gameStart": "Game started",
    "event.move": "{notation}",
    "event.capture": "{notation} captured {target}",
    "event.build": "Build: {piece}@{at}, cost {cost}",
    "event.income": "Mine {mine} +{amount}",
    "event.gameEnd": "{winner} wins",
    "event.failedCooldown": "Command failed: piece is cooling down",
    "event.failedIllegal": "Command failed: illegal target",
    "event.failedMoney": "Command failed: not enough money",
    "rule.victory": "You must actually capture the opposing King to win. Checkmate, stalemate, and draws are not used.",
    "rule.realtime": "Both sides act at the same time. After moving or capturing, that piece enters its own cooldown; movement mostly follows Chinese chess, but facing Kings are allowed.",
    "rule.resources": "Starting money is 50. Advisors, Elephants, Kings, and Pawns mine 5 money every 10 seconds while standing on a mine; newly built pieces immediately enter movement cooldown.",
    "rule.victory.capture": "Capture the opposing King to win immediately.",
    "rule.victory.noCheckmate": "Checkmate, stalemate, and draws are not used.",
    "rule.realtime.simultaneous": "Both sides act at the same time with no turns.",
    "rule.realtime.cooldown": "Moving or capturing puts that piece on its own cooldown.",
    "rule.realtime.standardMoves": "Piece movement mostly follows Chinese chess, but this game allows facing Kings.",
    "rule.resources.start": "Starting money is 50.",
    "rule.resources.mining": "Mining pieces gain 5 money every 10 seconds on a mine.",
    "rule.resources.build": "Building costs money, and new pieces immediately enter movement cooldown.",
    "rule.resources.miners": "Miners: Advisors, Elephants, Kings, and Pawns.",
    "rule.resources.income": "A miner on a mine gains 5 money every 10 seconds.",
    "rule.resources.buildPositions": "Rooks, Horses, Cannons, and Pawns build only on possible starting squares; Advisors and Elephants build on legal home-side reachable squares; Kings cannot be built.",
    "rule.resources.buildCooldown": "Building costs money, and new pieces immediately enter movement cooldown.",
    "rule.movement.kingAdvisor": "King: one orthogonal step inside the palace. Advisor: one diagonal step inside the palace.",
    "rule.movement.elephant": "Elephant: two-point diagonal, cannot cross the river, blocked by the elephant eye.",
    "rule.movement.rookHorse": "Rook: clear straight line. Horse: knight-like move, blocked by the horse leg.",
    "rule.movement.cannon": "Cannon: moves like a Rook, but captures by jumping exactly one screen.",
    "rule.movement.pawn": "Pawn: moves forward before crossing the river; after crossing, forward or sideways, never backward.",
    "rule.movement.flyingKing": "Facing Kings are allowed. Flying King: if the two Kings share a clear file, a King may capture the opposing King along that file.",
  },
};

export function detectLocale(): Locale {
  const saved = typeof localStorage === "undefined" ? undefined : localStorage.getItem("ccrts-locale");
  if (saved === "zh-CN" || saved === "zh-TW" || saved === "en-US") {
    return saved;
  }
  if (typeof navigator === "undefined") {
    return "en-US";
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (
      normalized.startsWith("zh-hant") ||
      normalized === "zh-tw" ||
      normalized === "zh-hk" ||
      normalized === "zh-mo"
    ) {
      return "zh-TW";
    }
    if (
      normalized.startsWith("zh-hans") ||
      normalized === "zh-cn" ||
      normalized === "zh-sg" ||
      normalized === "zh-my" ||
      normalized === "zh"
    ) {
      return "zh-CN";
    }
  }
  return "en-US";
}

export function t(
  locale: Locale,
  key: string,
  args: Record<string, string | number> = {},
): string {
  const template = messages[locale][key] ?? key;
  return Object.entries(args).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

export function eventText(locale: Locale, event: GameEvent): string {
  const args = { ...(event.messageArgs ?? {}) };
  for (const key of ["side", "winner"] as const) {
    const side = args[key];
    if (side === "red" || side === "black") {
      args[key] = t(locale, `side.${side}`);
    }
  }
  for (const key of ["piece", "target"] as const) {
    const piece = args[key];
    if (typeof piece === "string" && piece.startsWith("piece.")) {
      args[key] =
        key === "piece" && (args.side === "red" || args.side === "black")
          ? sidePieceLabel(locale, args.side, piece)
          : t(locale, piece);
    }
  }
  return `[${formatGameTime(event.gameTimeMs)}] ${t(locale, event.messageKey, args)}`;
}

function sidePieceLabel(locale: Locale, side: "red" | "black", pieceKey: string): string {
  if (locale === "en-US") {
    return t(locale, pieceKey);
  }

  const type = pieceKey.replace("piece.", "");
  const useTraditional = locale === "zh-TW";
  const red: Record<string, string> = {
    king: useTraditional ? "帥" : "帅",
    advisor: "仕",
    elephant: "相",
    rook: useTraditional ? "車" : "车",
    horse: useTraditional ? "馬" : "马",
    cannon: "炮",
    pawn: "兵",
  };
  const black: Record<string, string> = {
    king: "将",
    advisor: "士",
    elephant: "象",
    rook: useTraditional ? "車" : "车",
    horse: useTraditional ? "馬" : "马",
    cannon: "炮",
    pawn: "卒",
  };
  return side === "red" ? red[type] : black[type];
}

export function pieceGlyph(locale: Locale, side: Side, type: PieceType): string {
  const useTraditional = locale === "zh-TW";
  const red: Record<PieceType, string> = {
    king: useTraditional ? "帥" : "帅",
    advisor: "仕",
    elephant: "相",
    rook: useTraditional ? "車" : "车",
    horse: useTraditional ? "馬" : "马",
    cannon: "炮",
    pawn: "兵",
  };
  const black: Record<PieceType, string> = {
    king: "将",
    advisor: "士",
    elephant: "象",
    rook: useTraditional ? "車" : "车",
    horse: useTraditional ? "馬" : "马",
    cannon: "炮",
    pawn: "卒",
  };
  return side === "red" ? red[type] : black[type];
}

export function pieceLabel(locale: Locale, type: PieceType): string {
  return t(locale, `piece.${type}`);
}
