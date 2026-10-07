# Handy

Free browser-based tools for everyday users. Files are processed on the user's device and never uploaded.

Built with [Astro](https://astro.build). Plan: [docs/SCOPE.md](docs/SCOPE.md).

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start local site at http://localhost:4321 |
| `npm run build` | Build the production site into `dist/` |
| `npm run preview` | Serve the built site locally |

## Tests

Browser tests live in `tests/`. They need Google Chrome (set `CHROME_PATH` if it is not in the default Mac location).

| Command | What it does |
|---|---|
| `npm run test:e2e` | Builds the site, then runs every suite (about 3 minutes) |
| `npm run test:e2e -- --slow` | Also runs the slow-network suite |
| `node tests/run.mjs --only=pdf` | One suite only: `pages`, `images`, `pdf`, `docs`, `passport`, `slow` (build first) |
| `npm run check` | Type-checks the project |

Every page the tests open is also checked for the privacy promises: no request leaves the site, nothing is uploaded, no cookies, nothing stored in the browser.
