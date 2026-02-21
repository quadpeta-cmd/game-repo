# Game Hub MVP

Vite + React + TypeScript hub app lives at `apps/web`.

## Local development

```bash
cd apps/web
npm install
npm run dev
```

`npm run dev` regenerates `public/games/index.json` before starting Vite.

## Build and preview

```bash
cd apps/web
npm run build
npm run preview
```

`npm run build` regenerates `public/games/index.json` before bundling.

## Docker

```bash
docker compose up --build
```

Then open `http://localhost:8080`.
