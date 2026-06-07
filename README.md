# Chinese Chess RTS

English / [简体中文](./README_CN.md)

Chinese Chess RTS turns Xiangqi into a real-time strategy duel. Both sides act at the same time, capture mines, spend income to build new pieces, and pressure the enemy palace before their own king is hunted down. Pieces still follow familiar Xiangqi movement, but cooldowns, economy, build positions, and AI strategy make the match play more like a compact RTS.

You can play defensively for mines, raid the opponent's back rank to stop powerful builds, or rush the king before the economy matters.

## Authorship And AI Disclosure

This project was directed and designed by JennyMacedo through prompts, rule decisions, and iteration. The implementation, project organization, and this README itself were created with Codex, an AI coding agent based on GPT-5.

## Run Locally

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

## Game Rules

Objective: capture the opposing King. Checkmate, stalemate, repetition, and draw adjudication are not used.

Realtime play: there are no turns. Both sides can act continuously. After a piece moves or captures, that piece enters its own movement cooldown.

Starting position: each side begins with only a King, an Advisor, and an Elephant. Each side starts with 50 money.

Mines and income: Advisors, Elephants, Kings, and Pawns can mine. A mining piece standing on a mine earns 5 money every 10 seconds. Rooks, Horses, and Cannons cannot mine.

Building: money can be spent to build Pawns, Advisors, Elephants, Horses, Cannons, and Rooks. Kings cannot be built. New pieces immediately enter movement cooldown. A build square must be empty and legal for that piece type.

Build positions: Rooks, Horses, Cannons, and Pawns can only be built on their possible Xiangqi starting squares. Advisors and Elephants can be built on legal reachable home-side points.

Movement: pieces mostly follow standard Xiangqi movement. Rooks move in clear straight lines, Horses can be blocked by the horse leg, Cannons capture by jumping exactly one screen, Elephants cannot cross the river and can be blocked by the elephant eye, Advisors stay in the palace, Kings normally move one orthogonal palace step, and Pawns move forward before crossing the river and forward or sideways after crossing.

Flying King: if both Kings are on the same file with no piece between them, a King may capture the opposing King along that file. This game allows facing Kings; the game ends only when a King is actually captured.

AI: the current opponent uses an internal search and strategy system. It does not rely on an external Xiangqi engine. The AI evaluates King safety, immediate captures, material, mine control, enemy mine pressure, build opportunities, blocked build points, idle money, and piece danger.

## Project Structure

- `src/App.tsx`: main React UI, board interaction, build controls, and game loop.
- `src/game/rules.ts`: board rules, legal movement, building, mining, notation, and game state updates.
- `src/game/ai.ts`: internal AI controller and search logic.
- `src/game/types.ts`: core game types.
- `src/i18n.ts`: Simplified Chinese, Traditional Chinese, and English UI text.
- `src/styles.css`: visual styling.
