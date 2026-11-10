import { escapeMarkdown, markdownLink, formatAgeDays, formatPriorityFactors } from './markdown-utils.js';
import { formatDateUTC } from './utils.js';
import { SITE_RESOURCES, HISTORY_RESOURCES, SOURCE_REPO_URL } from './agent-resources.js';

const CI_LABELS = {
    success: 'success',
    failure: 'FAILURE',
    cancelled: 'cancelled',
    skipped: 'skipped',
    in_progress: 'running',
    queued: 'queued'
};

function resourceList() {
    const site = SITE_RESOURCES.map(r => `- [${r.title}](${r.path}): ${r.description}`);
    const history = HISTORY_RESOURCES.map(r => `- [${r.title}](${r.url}): ${r.description}`);
    return { site, history };
}

function describeOrgs(organizations) {
    return Object.keys(organizations).join(', ');
}

function generateActionItemsTable(actionItems) {
    if (actionItems.length === 0) return 'No action items.\n';
    let md = '| # | Type | Item | Repository | Score | Factors | Updated | Author | Review |\n';
    md += '|---|------|------|------------|-------|---------|---------|--------|--------|\n';
    for (const [i, item] of actionItems.entries()) {
        md += `| ${i + 1} | ${item.type === 'pr' ? 'PR' : 'Issue'} | ${markdownLink(item.title, item.url)} | ${item.org}/${item.repo} | ${item.priorityScore} | ${formatPriorityFactors(item.priorityFactors, ', ')} | ${formatAgeDays(item.ageDays)} ago | ${escapeMarkdown(item.author) || '-'} | ${item.reviewStatus || '-'} |\n`;
    }
    return md;
}

function generateIssueLine(issue) {
    const parts = [`updated ${formatAgeDays(issue.ageDays)} ago`];
    if (issue.staleLevel && issue.staleLevel !== 'ok') parts.push(`stale: ${issue.staleLevel}`);
    if (issue.labels?.length) parts.push(`labels: ${issue.labels.map(l => escapeMarkdown(l.name)).join(', ')}`);
    return `- ${markdownLink(issue.title, issue.url)} — ${parts.join(' · ')}\n`;
}

function generatePullRequestLine(pr) {
    const parts = [];
    if (pr.author) parts.push(`by ${escapeMarkdown(pr.author)}`);
    parts.push(`updated ${formatAgeDays(pr.ageDays)} ago`);
    if (pr.staleLevel && pr.staleLevel !== 'ok') parts.push(`stale: ${pr.staleLevel}`);
    parts.push(`review: ${pr.reviewStatus}`);
    return `- ${markdownLink(pr.title, pr.url)} — ${parts.join(' · ')}\n`;
}

function generateOrgSections(organizations) {
    let md = '';
    for (const [orgName, org] of Object.entries(organizations)) {
        const activeRepos = org.repositories.filter(r => r.issues.length > 0 || r.pullRequests.length > 0);
        if (activeRepos.length === 0) continue;

        md += `\n### ${escapeMarkdown(orgName)}\n`;
        for (const repo of activeRepos) {
            md += `\n#### ${markdownLink(repo.name, repo.url)}\n`;
            if (repo.issues.length > 0) {
                md += `\nIssues (${repo.issues.length}):\n\n`;
                md += repo.issues.map(generateIssueLine).join('');
            }
            if (repo.pullRequests.length > 0) {
                md += `\nPull requests (${repo.pullRequests.length}):\n\n`;
                md += repo.pullRequests.map(generatePullRequestLine).join('');
            }
        }
    }
    return md || '\nNo open issues or pull requests.\n';
}

function generateHealthTable(organizations) {
    // Archived repos are skipped when workflow runs are collected, so they have
    // lastWorkflowRun === null; mirror the HTML table and leave them out.
    const rows = [];
    for (const [orgName, org] of Object.entries(organizations)) {
        for (const repo of org.repositories) {
            if (repo.lastWorkflowRun === null) continue;
            rows.push({ org: orgName, ...repo });
        }
    }
    rows.sort((a, b) => a.org.localeCompare(b.org) || a.name.localeCompare(b.name));
    if (rows.length === 0) return 'No repository health data.\n';

    let md = '| Repository | CI | Last Workflow Run (UTC) | Last Commit (UTC) |\n';
    md += '|------------|----|-------------------------|-------------------|\n';
    for (const repo of rows) {
        const conclusion = repo.lastWorkflowRun?.conclusion;
        const ci = conclusion ? (CI_LABELS[conclusion] || conclusion) : '-';
        md += `| ${markdownLink(`${repo.org}/${repo.name}`, repo.url)} | ${ci} | ${formatDateUTC(repo.lastWorkflowRun?.date)} | ${formatDateUTC(repo.lastCommitDate)} |\n`;
    }
    return md;
}

function generateMissingMirrorsTable(missingMirrors) {
    if (missingMirrors.length === 0) return 'All necessary Magento repositories have been mirrored.\n';
    let md = '| Repository | Last Updated (UTC) |\n';
    md += '|------------|--------------------|\n';
    for (const repo of missingMirrors) {
        md += `| ${markdownLink(repo.name, repo.url)} | ${formatDateUTC(repo.lastUpdated)} |\n`;
    }
    return md;
}

/**
 * Full Markdown equivalent of the HTML dashboard, built only from the
 * dashboard JSON so it can be regenerated from any historical snapshot.
 */
export function generateMarkdownDashboard(data, config) {
    const { stats, organizations, actionItems, missingMirrors, generatedAt } = data;
    const { warningDays, criticalDays } = config.staleThresholds;
    const { site, history } = resourceList();

    return `# Mage-OS Dashboard

> Open issues, pull requests, CI health, and mirror coverage for the Mage-OS GitHub organizations (${describeOrgs(organizations)}). This is the Markdown version of the HTML dashboard, regenerated about every 3 hours.

Generated: ${formatDateUTC(generatedAt)} UTC

## Machine-readable resources

${site.join('\n')}

Historical data (the \`data\` branch of ${SOURCE_REPO_URL}):

${history.join('\n')}

## Summary

| Metric | Count |
|--------|-------|
| Repositories | ${stats.totalRepos} |
| Open issues | ${stats.totalIssues} |
| Open PRs | ${stats.totalPRs} |
| Stale PRs (no update >${warningDays}d) | ${stats.stalePRs} |
| Stale issues (no update >${criticalDays}d) | ${stats.staleIssues} |

## Top Action Items

Ranked by priority score (0-100) combining age, review status, labels, and repository activity. Ages are time since last update.

${generateActionItemsTable(actionItems)}
## Open Issues and Pull Requests
${generateOrgSections(organizations)}
## Repository Health

${generateHealthTable(organizations)}
## Magento Repositories Without Mage-OS Mirrors

${generateMissingMirrorsTable(missingMirrors)}`;
}

/**
 * llms.txt (https://llmstxt.org) index pointing agents at the Markdown/JSON
 * versions and the historical archive.
 */
export function generateLlmsTxt(data, config) {
    const { site, history } = resourceList();
    const { warningDays, criticalDays } = config.staleThresholds;

    return `# Mage-OS Dashboard

> Health dashboard for the Mage-OS GitHub organizations (${describeOrgs(data.organizations)}): open issues and pull requests, priority-ranked action items, CI status per repository, and Magento repositories not yet mirrored. Rebuilt from the GitHub API about every 3 hours.

Prefer the Markdown or JSON versions below over scraping the HTML page. Requesting \`/\` with \`Accept: text/markdown\` also returns the Markdown version.

Notes for interpreting the data:

- "Age" / \`ageDays\` is days since the item was last updated, not since it was created (\`createdAt\` is in the JSON).
- \`staleLevel\` is \`warning\` after ${warningDays} days without updates and \`critical\` after ${criticalDays}.
- \`priorityScore\` (0-100) sums \`priorityFactors\`: age, reviewStatus (PRs only), labels (bug/security weigh most), repoActivity (stale item in a recently active repo).
- \`actionItems\` holds the top 20 items by priority score across all organizations.
- All timestamps are UTC ISO 8601.

## Current data

${site.join('\n')}

## Historical data

Snapshots share the schema of \`/dashboard-data.json\`, so they can be compared to track trends over time.

${history.join('\n')}

## Optional

- [Source code](${SOURCE_REPO_URL}): generator source; schema is defined by \`collectDashboardData()\` in \`src/data-processing.js\`
`;
}

/**
 * Cloudflare Pages `_headers` file: advertise alternates via HTTP Link headers
 * and make sure Markdown/text files get a sensible Content-Type.
 */
export function generateHeadersFile() {
    const linkHeaders = [
        '  Link: </index.md>; rel="alternate"; type="text/markdown"',
        '  Link: </dashboard-data.json>; rel="alternate"; type="application/json"',
        '  Link: </llms.txt>; rel="describedby"; type="text/plain"'
    ].join('\n');

    return `/
${linkHeaders}

/index.html
${linkHeaders}

/index.md
  Content-Type: text/markdown; charset=utf-8

/report.md
  Content-Type: text/markdown; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8
`;
}
