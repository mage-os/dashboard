# Mage-OS Dashboard

A dashboard showing an overview of all Mage-OS repositories, open issues, and pull requests. Generates a static HTML page deployed to Cloudflare Pages, plus structured JSON and markdown reports archived to the `data` branch.

## Features

- **Organization overview** — open issues and PRs for all configured GitHub organizations
- **Repository health** — CI status, last workflow run, and last commit date for each repo
- **Missing mirrors** — Magento repositories not yet mirrored in Mage-OS
- **Priority scoring** — action items ranked by age, review status, labels, and repo activity
- **Staleness tracking** — visual indicators for stale issues (>90d) and PRs (>30d)
- **Client-side search** — filter across all sections by repository, issue, PR, author, or label
- **Structured data output** — JSON snapshot and markdown report for downstream consumption

## Project Structure

```
generate-dashboard.js    # Entry point — orchestrates fetching, processing, and HTML generation
generate-report.js       # Reads JSON output and generates a markdown report
config.json              # Organizations, thresholds, priority weights, ignore lists
src/
  config.js              # Loads and exports config
  utils.js               # Pure utility functions (date formatting, staleness, review status)
  github-api.js          # GitHub GraphQL and REST API fetchers
  data-processing.js     # Stats computation, priority scoring, data collection
  html-generators.js     # HTML section generators (org cards, health table, summary)
tests/
  utils.test.js          # Tests for utility functions
  data-processing.test.js # Tests for stats, priority scoring, workflow/mirror collection
  html-generators.test.js # Tests for badge and icon helpers
```

## Setup

Requires Node.js >= 18.

```sh
npm install
```

## Usage

Generate the dashboard (requires a GitHub personal access token):

```sh
GITHUB_TOKEN=ghp_... node generate-dashboard.js
```

This produces:
- `dist/index.html` — the static HTML dashboard
- `dist/dashboard-data.json` — structured JSON snapshot

Then generate the markdown report from the JSON:

```sh
node generate-report.js
```

This produces:
- `dist/report.md` — markdown summary with action items, stale PRs/issues, and missing mirrors

## Testing

```sh
npm test
```

Runs Jest with ESM support. Tests cover utility functions, data processing logic, and HTML helpers.

## Configuration

Edit `config.json`:

- **`organizations`** — GitHub org names to track
- **`staleThresholds`** — days before issues/PRs are flagged as warning (30) or critical (90)
- **`priorityWeights`** — weights for priority scoring factors (age, reviewStatus, labels, repoActivity)
- **`missingMirrorsIgnoreList`** — Magento repo names to exclude from the missing mirrors report

## Deployment

The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs every 3 hours:

1. Generates the dashboard and report
2. Archives a JSON snapshot to the `data` branch
3. Triggers a Cloudflare Pages deploy via webhook

The `data` branch maintains historical snapshots under `snapshots/YYYY/MM/` along with `latest.json` and `latest-report.md`.
