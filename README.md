# Chinese Chess RTS / 即时象棋 RTS

## English

Chinese Chess RTS turns Xiangqi into a real-time strategy duel. Both sides act at the same time, capture mines, spend income to build new pieces, and pressure the enemy palace before their own king is hunted down. Pieces still follow familiar Xiangqi movement, but cooldowns, economy, build positions, and AI strategy make the match play more like a compact RTS.

You can play defensively for mines, raid the opponent's back rank to stop powerful builds, or rush the king before the economy matters.

### Authorship And AI Disclosure

This project was directed and designed through prompts, rule decisions, and iteration by haruka411. The implementation, README drafting, and project organization were created with Codex, an AI coding agent based on GPT-5.

### Run Locally

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5173/
```

Build production files:

```bash
npm run build
```

### Game Rules

Objective: capture the opposing King. Checkmate, stalemate, repetition, and draw adjudication are not used.

Realtime play: there are no turns. Both sides can act continuously. After a piece moves or captures, that piece enters its own movement cooldown.

Starting position: each side begins with only a King, an Advisor, and an Elephant. Each side starts with 50 money.

Mines and income: Advisors, Elephants, Kings, and Pawns can mine. A mining piece standing on a mine earns 5 money every 10 seconds. Rooks, Horses, and Cannons cannot mine.

Building: money can be spent to build Pawns, Advisors, Elephants, Horses, Cannons, and Rooks. Kings cannot be built. New pieces immediately enter movement cooldown. A build square must be empty and legal for that piece type.

Build positions: Rooks, Horses, Cannons, and Pawns can only be built on their possible Xiangqi starting squares. Advisors and Elephants can be built on legal reachable home-side points.

Movement: pieces mostly follow standard Xiangqi movement. Rooks move in clear straight lines, Horses can be blocked by the horse leg, Cannons capture by jumping exactly one screen, Elephants cannot cross the river and can be blocked by the elephant eye, Advisors stay in the palace, Kings normally move one orthogonal palace step, and Pawns move forward before crossing the river and forward or sideways after crossing.

Flying King: if both Kings are on the same file with no piece between them, a King may capture the opposing King along that file. This game allows facing Kings; the game ends only when a King is actually captured.

AI: the current opponent uses an internal search and strategy system. It does not rely on an external Xiangqi engine. The AI evaluates King safety, immediate captures, material, mine control, enemy mine pressure, build opportunities, blocked build points, idle money, and piece danger.

### Project Structure

- `src/App.tsx`: main React UI, board interaction, build controls, and game loop.
- `src/game/rules.ts`: board rules, legal movement, building, mining, notation, and game state updates.
- `src/game/ai.ts`: internal AI controller and search logic.
- `src/game/types.ts`: core game types.
- `src/i18n.ts`: Simplified Chinese, Traditional Chinese, and English UI text.
- `src/styles.css`: visual styling.

## 中文

《即时象棋 RTS》把中国象棋改造成一场即时战略对局。双方不再轮流行动，而是在同一张棋盘上同时调度棋子、占领矿点、用收入建造新棋子，并在己方将帅被猎杀前压迫对方九宫。棋子的走法仍以中国象棋为基础，但冷却、经济、建造位置和 AI 策略会让对局更接近一场小型 RTS。

你可以稳守矿点，也可以突袭对方底线限制车马炮建造，或者在经济成型前直接冲击将帅。

### 创作声明

本项目由 haruka411 通过提示、规则设计、方向决策和反复反馈进行创作指导。项目实现、README 整理和代码组织由 Codex 协助完成；Codex 是基于 GPT-5 的 AI 编程代理。

### 本地运行

```bash
npm install
npm run dev
```

默认本地地址：

```text
http://127.0.0.1:5173/
```

构建生产文件：

```bash
npm run build
```

### 游戏规则

胜利目标：吃掉对方将/帅。游戏不使用将死、困毙、长将判负或和棋判定。

即时行动：双方没有回合。双方可以持续行动。棋子移动或吃子后，该棋子进入独立移动冷却。

初始局面：双方开局只有将/帅、士/仕、象/相。双方初始金钱为 50。

矿点与收入：士/仕、象/相、将/帅、卒/兵可以采矿。可采矿棋子站在矿点上时，每 10 秒为该阵营获得 5 金钱。车、马、炮不能采矿。

建造：玩家和 AI 可以花费金钱建造卒/兵、士/仕、象/相、马、炮、车。不能建造将/帅。新建造的棋子会立刻进入移动冷却。建造目标格必须为空，并且必须是该棋子的合法建造位置。

建造位置：车、马、炮、卒/兵只能建在该棋子可能的象棋初始位置。士/仕、象/相可以建在己方半场内按规则可到达的合法点。

棋子走法：棋子基本沿用中国象棋走法。车走无阻挡直线；马走日并受蹩马腿限制；炮移动同车，吃子时必须隔一个炮架；象/相走田、受塞象眼限制且不能过河；士/仕在九宫内走斜线；将/帅通常在九宫内横竖移动一格；卒/兵过河前只能前进，过河后可前进或左右平移，不能后退。

飞将：如果双方将/帅位于同一路且中间没有棋子阻挡，将/帅可以沿该路直接吃掉对方将/帅。本游戏允许将帅照面；只有实际吃掉将/帅才会结束游戏。

AI：当前对手使用自研搜索与策略系统，不依赖外部象棋引擎。AI 会评估将帅安全、直接吃王机会、子力价值、矿点控制、对方矿点压迫、建造机会、建造点堵塞、闲置金钱和棋子被吃风险。

### 项目结构

- `src/App.tsx`：主 React UI、棋盘交互、建造控件和游戏循环。
- `src/game/rules.ts`：棋盘规则、合法走法、建造、采矿、记谱和局面更新。
- `src/game/ai.ts`：自研 AI 控制器和搜索逻辑。
- `src/game/types.ts`：核心游戏类型。
- `src/i18n.ts`：简体中文、繁体中文和英文界面文本。
- `src/styles.css`：视觉样式。
