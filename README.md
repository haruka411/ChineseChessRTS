# Chinese Chess RTS

Real-time Xiangqi with economy, buildable pieces, cooldowns, mines, and hidden-strategy AI.

即时象棋 RTS：在中国象棋走法基础上加入资源、建造、冷却、矿点和隐藏策略 AI。

## Run

```bash
npm install
npm run dev
```

Default local URL:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

The static site is written to `dist/` with relative asset paths, so it can be uploaded to itch.io as a static HTML game.

## Package For itch.io

```bash
npm run package:itch
```

This creates:

```text
chinese-chess-rts-itch.zip
```

Upload the zip to itch.io and choose the HTML/browser game option.

## Description

The bilingual short game description is in [docs/itch-description.md](docs/itch-description.md).
