import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Shield, Swords } from "lucide-react";
import { createHybridAiController, type HybridAiController } from "./game/ai";
import {
  advanceEconomy,
  buildPiece,
  buildSquares,
  createInitialGame,
  formatGameTime,
  isLegalBuild,
  legalMovesForPiece,
  MINING_TYPES,
  mineAt,
  movePiece,
  pieceAt,
  sameCoord,
  sideNameKey,
} from "./game/rules";
import type { Coord, GameState, Locale, PieceState, PieceType, Side } from "./game/types";
import { detectLocale, eventText, pieceGlyph, pieceLabel, t } from "./i18n";

const buildTypes: Array<Exclude<PieceType, "king">> = [
  "pawn",
  "advisor",
  "elephant",
  "horse",
  "cannon",
  "rook",
];

const CELL_SIZE = 64;
const BOARD_WIDTH = 9;
const BOARD_HEIGHT = 10;
const redFiles = ["九", "八", "七", "六", "五", "四", "三", "二", "一"];
const blackFiles = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const localeOptions: Array<{ value: Locale; label: string }> = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en-US", label: "English" },
];

export function App() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const [game, setGameState] = useState<GameState>(() => createInitialGame());
  const [playerSide, setPlayerSide] = useState<Side | undefined>();
  const [selectedPieceId, setSelectedPieceId] = useState<string | undefined>();
  const [buildType, setBuildType] = useState<Exclude<PieceType, "king"> | undefined>();
  const gameRef = useRef(game);
  const aiControllerRef = useRef<HybridAiController | undefined>(undefined);
  const startRef = useRef(performance.now());
  const pauseStartedRef = useRef<number | undefined>(undefined);
  const pausedTotalRef = useRef(0);

  if (!aiControllerRef.current) {
    aiControllerRef.current = createHybridAiController();
  }

  const setGame = (updater: GameState | ((current: GameState) => GameState)) => {
    setGameState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      gameRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem("ccrts-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const aiSide = playerSide === "black" ? "red" : "black";

  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      if (playerSide) {
        const current = gameRef.current;
        if (current.status !== "paused" && current.status !== "ended") {
          const now = performance.now();
          const gameTimeMs = now - startRef.current - pausedTotalRef.current;
          const advanced = advanceEconomy(current, gameTimeMs);
          gameRef.current = advanced;
          setGameState(advanced);
          aiControllerRef.current?.tick(advanced, gameTimeMs, aiSide, (updater) => {
            const next = updater(gameRef.current);
            gameRef.current = next;
            setGameState(next);
          });
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [aiSide, playerSide]);

  useEffect(() => () => aiControllerRef.current?.dispose(), []);

  const selectedPiece = selectedPieceId ? game.pieces[selectedPieceId] : undefined;
  const selectedReady = Boolean(
    selectedPiece && selectedPiece.alive && game.gameTimeMs >= selectedPiece.cooldownUntilMs,
  );
  const legalMoves = useMemo(
    () => (selectedPiece && selectedPiece.alive ? legalMovesForPiece(game, selectedPiece) : []),
    [game, selectedPiece],
  );
  const legalBuildSquares = useMemo(
    () =>
      buildType
        ? buildSquares(playerSide ?? "red", buildType).filter((coord) =>
            isLegalBuild(game, playerSide ?? "red", buildType, coord),
          )
        : [],
    [buildType, game, playerSide],
  );

  const resetClock = () => {
    startRef.current = performance.now();
    pausedTotalRef.current = 0;
    pauseStartedRef.current = undefined;
  };

  const startGame = (side: Side) => {
    resetClock();
    aiControllerRef.current?.reset();
    setPlayerSide(side);
    setSelectedPieceId(undefined);
    setBuildType(undefined);
    setGame(createInitialGame());
  };

  const restart = () => {
    resetClock();
    aiControllerRef.current?.reset();
    setPlayerSide(undefined);
    setSelectedPieceId(undefined);
    setBuildType(undefined);
    setGame(createInitialGame());
  };

  const togglePause = () => {
    setGame((current) => {
      if (current.status === "ended") {
        return current;
      }
      if (current.status === "paused") {
        if (pauseStartedRef.current !== undefined) {
          pausedTotalRef.current += performance.now() - pauseStartedRef.current;
        }
        pauseStartedRef.current = undefined;
        return { ...current, status: "running" };
      }
      pauseStartedRef.current = performance.now();
      return { ...current, status: "paused" };
    });
  };

  const handleCellClick = (coord: Coord) => {
    if (!playerSide || game.status !== "running") {
      return;
    }

    const clickedPiece = pieceAt(game, coord);
    if (clickedPiece?.side === playerSide) {
      setBuildType(undefined);
      setSelectedPieceId(clickedPiece.id);
      return;
    }

    if (buildType) {
      if (legalBuildSquares.some((square) => sameCoord(square, coord))) {
        setGame((current) => buildPiece(current, playerSide, buildType, coord, current.gameTimeMs));
        setBuildType(undefined);
      }
      return;
    }

    if (selectedPieceId && selectedReady && legalMoves.some((move) => sameCoord(move, coord))) {
      setGame((current) => movePiece(current, selectedPieceId, coord, current.gameTimeMs, playerSide));
      setSelectedPieceId(undefined);
    }
  };

  if (!playerSide) {
    return <StartScreen locale={locale} setLocale={setLocale} onStart={startGame} />;
  }

  const boardFlipped = playerSide === "black";
  const topLabels = boardFlipped ? [...redFiles].reverse() : blackFiles;
  const topLabelSide: Side = boardFlipped ? "red" : "black";
  const bottomLabels = boardFlipped ? [...blackFiles].reverse() : redFiles;
  const bottomLabelSide: Side = boardFlipped ? "black" : "red";

  return (
    <div className="app-shell">
      <header className="game-title">
        <h1>
          <span className="sword-mark" aria-hidden="true">
            <Swords />
          </span>
          {t(locale, "app.title")}
          <span className="sword-mark flipped" aria-hidden="true">
            <Swords />
          </span>
        </h1>
        <p>{t(locale, "app.subtitle")}</p>
        <LanguageSelector className="title-language" locale={locale} setLocale={setLocale} />
      </header>

      <main className="game-layout">
        <aside className="left-rail">
          <section className="panel-section control-panel">
            <button className="secondary" onClick={togglePause}>
              {game.status === "paused" ? t(locale, "action.resume") : t(locale, "action.pause")}
            </button>
            <button className="restart-button" onClick={restart}>
              <span className="restart-icon" aria-hidden="true">🎮</span>
              <span>{t(locale, "action.restart")}</span>
            </button>
            <div className="game-timer">{formatGameTime(game.gameTimeMs)}</div>
          </section>
          <section className="panel-section notation-panel">
            <EventLog game={game} locale={locale} />
          </section>
        </aside>

        <section className="board-section">
          <CoordinateLabels labels={topLabels} side={topLabelSide} />
          <div className="board-frame">
            <div className="board" aria-label="Chinese chess board">
              <BoardGuides flipped={boardFlipped} />
              <BoardSurface
                game={game}
                locale={locale}
                side={playerSide}
                flipped={boardFlipped}
                buildType={buildType}
                selectedPieceId={selectedPieceId}
                movesDisabled={!selectedReady}
                legalMoves={legalMoves}
                legalBuildSquares={legalBuildSquares}
                onCellClick={handleCellClick}
              />
            </div>
          </div>
          <CoordinateLabels labels={bottomLabels} side={bottomLabelSide} />
        </section>

        <aside className="right-rail">
          <PlayerCards game={game} locale={locale} />
          <section className="panel-section">
            <PieceStats game={game} locale={locale} />
          </section>
          <BuildPanel
            game={game}
            locale={locale}
            side={playerSide}
            buildType={buildType}
            setBuildType={(type) => {
              setSelectedPieceId(undefined);
              setBuildType(type);
            }}
          />
        </aside>
      </main>

      <RulesPanel locale={locale} />
    </div>
  );
}

function StartScreen({
  locale,
  setLocale,
  onStart,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  onStart: (side: Side) => void;
}) {
  return (
    <main className="start-screen">
      <LanguageSelector className="start-language" locale={locale} setLocale={setLocale} />
      <section className="start-card">
        <div className="start-title">
          <span className="start-sword" aria-hidden="true">
            <Swords />
          </span>
          <h1>{t(locale, "app.title")}</h1>
          <span className="start-sword flipped" aria-hidden="true">
            <Swords />
          </span>
        </div>
        <p>{t(locale, "app.subtitle")}</p>

        <div className="side-select">
          <strong>{t(locale, "start.chooseSide")}</strong>
          <button className="side-button red" onClick={() => onStart("red")}>
            <Crown aria-hidden="true" />
            <span>{t(locale, "side.red")}</span>
          </button>
          <button className="side-button black" onClick={() => onStart("black")}>
            <Shield aria-hidden="true" />
            <span>{t(locale, "side.black")}</span>
          </button>
        </div>

        <div className="start-rules">
          <strong>{t(locale, "label.rules")}</strong>
          <p>{t(locale, "start.ruleSummary")}</p>
        </div>
      </section>
    </main>
  );
}

function LanguageSelector({
  className,
  locale,
  setLocale,
}: {
  className: string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  return (
    <label className={`language-select ${className}`}>
      <span>{t(locale, "label.language")}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        {localeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PieceStats({ game, locale }: { game: GameState; locale: Locale }) {
  return (
    <>
      <h2>ⓘ {t(locale, "label.pieceStats")}</h2>
      <div className="stats-table">
        <span>{t(locale, "label.piece")}</span>
        <strong className="red-text">{t(locale, "side.red")}</strong>
        <strong className="blue-text">{t(locale, "side.black")}</strong>
        {buildTypes.map((type) => (
          <PieceStatRow key={type} game={game} locale={locale} type={type} />
        ))}
      </div>
    </>
  );
}

function PieceStatRow({
  game,
  locale,
  type,
}: {
  game: GameState;
  locale: Locale;
  type: Exclude<PieceType, "king">;
}) {
  const red = Object.values(game.pieces).filter(
    (piece) => piece.alive && piece.side === "red" && piece.type === type,
  ).length;
  const black = Object.values(game.pieces).filter(
    (piece) => piece.alive && piece.side === "black" && piece.type === type,
  ).length;
  return (
    <>
      <span>{pieceLabel(locale, type)}</span>
      <span className="red-text">{red}</span>
      <span className="blue-text">{black}</span>
    </>
  );
}

function EventLog({ game, locale }: { game: GameState; locale: Locale }) {
  const visibleEvents = game.events.filter(
    (event) => event.type !== "income" && event.type !== "game_start",
  );
  return (
    <section className="event-panel">
      <h2>↺ {t(locale, "label.events")}</h2>
      <ol>
        {visibleEvents.length === 0 ? (
          <li className="empty-log">{t(locale, "label.noEvents")}</li>
        ) : (
          visibleEvents.slice(0, 18).map((event) => (
            <li key={event.id} className={`event-item ${event.actor}`}>
              {eventText(locale, event)}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

function PlayerCards({ game, locale }: { game: GameState; locale: Locale }) {
  return (
    <section className="player-card-row">
      {(["red", "black"] as const).map((side) => {
        const activeMiners = Object.values(game.pieces).filter(
          (piece) =>
            piece.alive &&
            piece.side === side &&
            MINING_TYPES.has(piece.type) &&
            Boolean(mineAt(game, piece.position)),
        ).length;
        return (
          <div key={side} className={`player-card ${side}`}>
            <strong>{t(locale, sideNameKey(side))}</strong>
            <span>💰 {game.players[side].money}</span>
            <small>
              ⛏ {t(locale, "label.mining")}: {activeMiners}/{Object.keys(game.mines).length}
            </small>
          </div>
        );
      })}
    </section>
  );
}

function BuildPanel({
  game,
  locale,
  side,
  buildType,
  setBuildType,
}: {
  game: GameState;
  locale: Locale;
  side: Side;
  buildType?: Exclude<PieceType, "king">;
  setBuildType: (type: Exclude<PieceType, "king"> | undefined) => void;
}) {
  return (
    <section className="panel-section build-panel">
      <div className="section-heading">
        <h2>⚒ {t(locale, "label.build")}</h2>
        {buildType && (
          <button className="ghost" onClick={() => setBuildType(undefined)}>
            {t(locale, "label.cancelBuild")}
          </button>
        )}
      </div>
      <div className="build-grid">
        {buildTypes.map((type) => {
          const cost = game.rules.unitCosts[type];
          const cooldown = game.rules.moveCooldownMs[type] / 1000;
          const disabled = game.players[side].money < cost || game.status !== "running";
          return (
            <button
              key={type}
              className={buildType === type ? "build-button active" : "build-button"}
              disabled={disabled}
              onClick={() => setBuildType(type)}
            >
              <span>{pieceLabel(locale, type)}</span>
              <small>💰 {cost}</small>
              <small>⏱ {cooldown}s</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RulesPanel({ locale }: { locale: Locale }) {
  return (
    <section className="rules-panel">
      <h2>▣ {t(locale, "label.rules")}</h2>
      <div className="rules-grid">
        <div>
          <strong>🎯 {t(locale, "label.victory")}</strong>
          <ul>
            <li>{t(locale, "rule.victory.capture")}</li>
            <li>{t(locale, "rule.victory.noCheckmate")}</li>
          </ul>
        </div>
        <div>
          <strong>⏱ {t(locale, "label.realtime")}</strong>
          <ul>
            <li>{t(locale, "rule.realtime.simultaneous")}</li>
            <li>{t(locale, "rule.realtime.cooldown")}</li>
            <li>{t(locale, "rule.realtime.standardMoves")}</li>
          </ul>
        </div>
        <div>
          <strong>⛏ {t(locale, "label.resources")}</strong>
          <ul>
            <li>{t(locale, "rule.resources.start")}</li>
            <li>{t(locale, "rule.resources.miners")}</li>
            <li>{t(locale, "rule.resources.income")}</li>
            <li>{t(locale, "rule.resources.buildPositions")}</li>
            <li>{t(locale, "rule.resources.buildCooldown")}</li>
          </ul>
        </div>
        <div>
          <strong>♟ {t(locale, "label.movement")}</strong>
          <ul>
            <li>{t(locale, "rule.movement.kingAdvisor")}</li>
            <li>{t(locale, "rule.movement.elephant")}</li>
            <li>{t(locale, "rule.movement.rookHorse")}</li>
            <li>{t(locale, "rule.movement.cannon")}</li>
            <li>{t(locale, "rule.movement.pawn")}</li>
            <li>{t(locale, "rule.movement.flyingKing")}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function BoardGuides({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      className={flipped ? "board-guides flipped" : "board-guides"}
      viewBox="0 0 9 10"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="currentBoardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F5DEB3" />
          <stop offset="50%" stopColor="#FAEBD7" />
          <stop offset="100%" stopColor="#F5DEB3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="9" height="10" rx="0.11" fill="url(#currentBoardGradient)" />
      <rect x="0.08" y="0.08" width="8.84" height="9.84" rx="0.09" fill="none" className="board-outer-line" />
      <g className="board-grid-lines">
        {Array.from({ length: 10 }, (_, y) => (
          <line key={`h-${y}`} x1="0.5" x2="8.5" y1={y + 0.5} y2={y + 0.5} className={y === 0 || y === 9 ? "edge-line" : ""} />
        ))}
        {Array.from({ length: 9 }, (_, x) =>
          x === 0 || x === 8 ? (
            <line key={`v-${x}`} x1={x + 0.5} x2={x + 0.5} y1="0.5" y2="9.5" className="edge-line" />
          ) : (
            <g key={`v-${x}`}>
              <line x1={x + 0.5} x2={x + 0.5} y1="0.5" y2="4.5" />
              <line x1={x + 0.5} x2={x + 0.5} y1="5.5" y2="9.5" />
            </g>
          ),
        )}
        <line x1="3.5" y1="0.5" x2="5.5" y2="2.5" className="palace-line" />
        <line x1="5.5" y1="0.5" x2="3.5" y2="2.5" className="palace-line" />
        <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" className="palace-line" />
        <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" className="palace-line" />
      </g>
      <text x="2.25" y="5" textAnchor="middle" dominantBaseline="central" className="river-svg-text">楚 河</text>
      <text x="6.75" y="5" textAnchor="middle" dominantBaseline="central" className="river-svg-text">汉 界</text>
    </svg>
  );
}

function CoordinateLabels({ labels, side }: { labels: string[]; side: Side }) {
  return (
    <div className={`coordinate-labels ${side}`}>
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function BoardSurface({
  game,
  locale,
  side,
  flipped,
  buildType,
  selectedPieceId,
  movesDisabled,
  legalMoves,
  legalBuildSquares,
  onCellClick,
}: {
  game: GameState;
  locale: Locale;
  side: Side;
  flipped: boolean;
  buildType?: Exclude<PieceType, "king">;
  selectedPieceId?: string;
  movesDisabled: boolean;
  legalMoves: Coord[];
  legalBuildSquares: Coord[];
  onCellClick: (coord: Coord) => void;
}) {
  const handleBoardClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cellWidth = rect.width / BOARD_WIDTH;
    const cellHeight = rect.height / BOARD_HEIGHT;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const displayX = Math.round((px - cellWidth / 2) / cellWidth);
    const displayY = Math.round((py - cellHeight / 2) / cellHeight);
    if (displayX < 0 || displayX >= BOARD_WIDTH || displayY < 0 || displayY >= BOARD_HEIGHT) {
      return;
    }
    onCellClick(
      flipped
        ? { x: BOARD_WIDTH - 1 - displayX, y: displayY }
        : { x: displayX, y: BOARD_HEIGHT - 1 - displayY },
    );
  };

  return (
    <div
      className="board-surface"
      onClick={handleBoardClick}
    >
      {buildType &&
        legalBuildSquares.map((coord) => (
          <Positioned key={`build-${coord.x}-${coord.y}`} coord={coord} flipped={flipped} zIndex={5}>
            <BuildCandidate locale={locale} side={side} type={buildType} />
          </Positioned>
        ))}
      {Object.values(game.mines)
        .filter((mine) => !pieceAt(game, mine.position))
        .map((mine) => (
          <Positioned key={mine.id} coord={mine.position} flipped={flipped} zIndex={2}>
            <MineToken title={t(locale, "label.mine")} />
          </Positioned>
        ))}
      {Object.values(game.pieces)
        .filter((piece) => piece.alive)
        .map((piece) => (
          <Positioned key={piece.id} coord={piece.position} flipped={flipped} zIndex={3}>
            <PieceToken
              piece={piece}
              locale={locale}
              selected={piece.id === selectedPieceId}
              cooldownRemainingMs={Math.max(0, piece.cooldownUntilMs - game.gameTimeMs)}
              cooldownTotalMs={game.rules.moveCooldownMs[piece.type]}
            />
          </Positioned>
        ))}
      {Object.values(game.mines)
        .filter((mine) => pieceAt(game, mine.position))
        .map((mine) => {
          const piece = pieceAt(game, mine.position);
          const activeMining = Boolean(piece && MINING_TYPES.has(piece.type));
          const mineRemainingMs = Math.max(0, mine.nextIncomeAtMs - game.gameTimeMs);
          const mineAngle = activeMining
            ? Math.max(0, Math.min(360, (mineRemainingMs / mine.intervalMs) * 360))
            : 0;
          return (
            <Positioned key={`${mine.id}-occupied`} coord={mine.position} flipped={flipped} zIndex={4}>
              <MineToken occupied title={t(locale, "label.mine")} mineAngle={mineAngle} />
            </Positioned>
          );
        })}
      {legalMoves.map((coord) => (
        <Positioned key={`move-${coord.x}-${coord.y}`} coord={coord} flipped={flipped} zIndex={8}>
          <MoveCandidate hasPiece={Boolean(pieceAt(game, coord))} disabled={movesDisabled} />
        </Positioned>
      ))}
    </div>
  );
}

function Positioned({
  coord,
  children,
  flipped,
  zIndex,
}: {
  coord: Coord;
  children: ReactNode;
  flipped: boolean;
  zIndex?: number;
}) {
  const displayX = flipped ? BOARD_WIDTH - 1 - coord.x : coord.x;
  const displayY = flipped ? coord.y : BOARD_HEIGHT - 1 - coord.y;
  return (
    <div
      className="board-layer-item"
      style={{
        left: `${((displayX + 0.5) / BOARD_WIDTH) * 100}%`,
        top: `${((displayY + 0.5) / BOARD_HEIGHT) * 100}%`,
        zIndex,
      }}
    >
      {children}
    </div>
  );
}

function MoveCandidate({ hasPiece, disabled }: { hasPiece: boolean; disabled: boolean }) {
  return (
    <svg className="board-candidate" viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r={hasPiece ? 28 : 12}
        fill={
          disabled
            ? "rgba(128, 128, 128, 0.2)"
            : hasPiece
              ? "rgba(255, 0, 0, 0.3)"
              : "rgba(0, 128, 0, 0.4)"
        }
        stroke={disabled ? "#999999" : hasPiece ? "#FF0000" : "#00AA00"}
        strokeWidth="2"
      />
    </svg>
  );
}

function BuildCandidate({
  locale,
  side,
  type,
}: {
  locale: Locale;
  side: Side;
  type: Exclude<PieceType, "king">;
}) {
  return (
    <svg className="board-candidate build-candidate" viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="rgba(204, 0, 0, 0.15)"
        stroke="rgba(204, 0, 0, 0.5)"
        strokeWidth="2"
        strokeDasharray="4,4"
      />
      <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(204, 0, 0, 0.3)" strokeWidth="1" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="24"
        fontWeight="bold"
        fontFamily="KaiTi, STKaiti, serif"
        fill="rgba(204, 0, 0, 0.5)"
      >
        {pieceGlyph(locale, side, type)}
      </text>
    </svg>
  );
}

function MineToken({
  occupied = false,
  title,
  mineAngle = 0,
}: {
  occupied?: boolean;
  title: string;
  mineAngle?: number;
}) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - mineAngle / 360);
  return (
    <svg
      className={occupied ? "mine-token occupied" : "mine-token"}
      viewBox="0 0 32 32"
      aria-label={title}
    >
      <circle cx="16" cy="16" r="11" fill={occupied ? "#E8BF4F" : "#D6A834"} stroke="#9B7418" strokeWidth="1.5" />
      {mineAngle > 0 && (
        <>
          <circle
            className="mine-ring-outline"
            cx="16"
            cy="16"
            r={radius + 2}
            fill="none"
            stroke="rgba(21,128,61,0.56)"
            strokeWidth="1.5"
          />
          <circle
            className="mine-ring-border"
            cx="16"
            cy="16"
            r={radius}
            fill="none"
            stroke="rgba(34,197,94,0.22)"
            strokeWidth="3"
          />
          <circle
            className="mine-progress-ring"
            cx="16"
            cy="16"
            r={radius}
            fill="none"
            stroke="#22C55E"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 16 16)"
          />
        </>
      )}
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="bold"
        fill="#6F5016"
      >
        ⛏
      </text>
    </svg>
  );
}

function PieceToken({
  piece,
  locale,
  selected,
  cooldownRemainingMs,
  cooldownTotalMs,
}: {
  piece: PieceState;
  locale: Locale;
  selected: boolean;
  cooldownRemainingMs: number;
  cooldownTotalMs: number;
}) {
  const isRed = piece.side === "red";
  const color = isRed ? "#CC0000" : "#000088";
  const radius = CELL_SIZE / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const cooldownPercent = cooldownRemainingMs / cooldownTotalMs;
  const cooldownDashOffset = circumference * (1 - cooldownPercent);

  return (
    <svg className={selected ? "piece-token selected" : "piece-token"} viewBox="0 0 64 64" aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="26"
        fill={selected ? (isRed ? "#FFD700" : "#87CEEB") : "#F5DEB3"}
        stroke={color}
        strokeWidth={selected ? 3 : 2}
      />
      <circle cx="32" cy="32" r="22" fill="none" stroke={color} strokeWidth="1" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="24"
        fontWeight="bold"
        fontFamily="KaiTi, STKaiti, serif"
        fill={color}
      >
        {pieceGlyph(locale, piece.side, piece.type)}
      </text>
      {cooldownRemainingMs > 0 && (
        <>
          <circle
            className="cooldown-ring-outline"
            cx="32"
            cy="32"
            r={radius + 2}
            fill="none"
            stroke="rgba(127,29,29,0.54)"
            strokeWidth="1.5"
          />
          <circle
            className="cooldown-ring-border"
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="rgba(128,128,128,0.3)"
            strokeWidth="4"
          />
          <circle
            className="cooldown-progress-ring"
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#FF4444"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={cooldownDashOffset}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
          />
        </>
      )}
    </svg>
  );
}
