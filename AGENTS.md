# Agent Context

This is a Node.js static site generator (ES modules, Node >= 18) that builds an HTML dashboard for Mage-OS GitHub organizations. It fetches live data from the GitHub API and outputs static HTML, JSON, and markdown reports.

## Key entry points

- `generate-dashboard.js` — main build script, produces `dist/index.html`, `dist/dashboard-data.json`, and the agent-facing files below
- `generate-report.js` — standalone CLI that regenerates `dist/report.md` from `dist/dashboard-data.json`
- `config.json` — organizations, thresholds, priority weights, ignore lists

## Structured data

The build produces `dist/dashboard-data.json` with the full dashboard state: stats, per-org repositories with issues/PRs, priority-scored action items, and missing mirror data. The schema is defined by `collectDashboardData()` in `src/data-processing.js`.

## Agent-facing output

Every build also writes, alongside `index.html`:

- `dist/index.md` — full Markdown twin of the HTML dashboard (`src/agent-docs.js`, built only from the JSON)
- `dist/report.md` — condensed summary report (`src/report.js`)
- `dist/llms.txt` — [llms.txt](https://llmstxt.org) index of the Markdown/JSON/history resources
- `dist/_headers` — Cloudflare Pages headers: `Link` alternates on `/`, Markdown content types

`index.html` advertises these via `<link rel="alternate">` tags and a visible "For AI agents and scripts" line. `functions/index.js` is a Cloudflare Pages Function on `/` that returns `index.md` when the request's `Accept` header prefers `text/markdown` (`src/content-negotiation.js`). Resource URLs live in `src/agent-resources.js`.

## Historical data

The `data` branch contains time-series snapshots archived by CI every 3 hours:

- `latest.json` — most recent dashboard JSON snapshot
- `latest-report.md` — most recent markdown report
- `snapshots/YYYY/MM/YYYY-MM-DD-HH.json` — historical snapshots

## Running

```sh
npm install
npm test                                        # run jest tests
GITHUB_TOKEN=ghp_... node generate-dashboard.js # generate dashboard
node generate-report.js                         # generate markdown report
```
