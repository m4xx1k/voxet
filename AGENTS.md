# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the TypeScript source.
- `src/bot.ts` is the entry point.
- `src/config.ts` loads environment config.
- `src/handlers/` contains Telegram handlers (ex: `voice.handler.ts`).
- `src/services/` contains integrations and utilities (ex: `transcribe.service.ts`, `rate-limiter.service.ts`).
- `data/` stores runtime usage data (gitignored).
- `dist/` is the TypeScript build output.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` runs the bot with hot reload via `tsx watch` (local development).
- `npm run build` compiles TypeScript into `dist/`.
- `npm run start` runs the compiled bot from `dist/bot.js`.

## Coding Style & Naming Conventions
- TypeScript, ESM modules (`"type": "module"` in `package.json`).
- Use `.js` extensions in local import paths inside TS (ex: `./config.js`).
- Indentation: 2 spaces; follow existing formatting in `src/`.
- File naming: kebab-case with suffixes for roles (ex: `voice.handler.ts`, `rate-limiter.service.ts`).
- Keep config in `src/config.ts`; do not read `.env` directly in feature modules.

## Testing Guidelines
- No automated test suite is currently configured.
- If you add tests, document the framework and add a `npm run test` script in `package.json`.

## Commit & Pull Request Guidelines
- Git history uses Conventional Commits (example: `feat: add rate limiting`).
PRs should include:
- A short summary of behavior changes.
- Any env/config changes (ex: new `.env` keys).
- Evidence for runtime changes when relevant (logs or screenshots of bot output).

## Configuration & Security Tips
- Copy `.env.example` to `.env` and set `BOT_TOKEN`, `OPENAI_API_KEY`, and `BOT_MODE`.
- Do not commit real tokens or keys.
