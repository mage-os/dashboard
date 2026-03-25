# Agent Context

This is a Node.js static site generator (ES modules, Node >= 18) that builds an HTML dashboard for Mage-OS GitHub organizations. It fetches live data from the GitHub API and outputs static HTML, JSON, and markdown reports.

## Key entry points

- `generate-dashboard.js` — main build script, produces `dist/index.html` and `dist/dashboard-data.json`
- `generate-report.js` — reads the JSON output and generates `dist/report.md`
- `config.json` — organizations, thresholds, priority weights, ignore lists

## Structured data

The build produces `dist/dashboard-data.json` with the full dashboard state: stats, per-org repositories with issues/PRs, priority-scored action items, and missing mirror data. The schema is defined by `collectDashboardData()` in `src/data-processing.js`.

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
