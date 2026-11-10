import { escapeMarkdown, markdownLink, formatPriorityFactors } from './markdown-utils.js';

const MAX_ACTION_ITEMS = 10;
const MAX_STALE_ROWS = 20;

function collectStaleItems(organizations) {
    const stalePRs = [];
    const staleIssues = [];
    for (const [orgName, org] of Object.entries(organizations)) {
        for (const repo of org.repositories) {
            for (const pr of repo.pullRequests) {
                if (pr.staleLevel === 'warning' || pr.staleLevel === 'critical') {
                    stalePRs.push({ ...pr, repo: repo.name, org: orgName });
                }
            }
            for (const issue of repo.issues) {
                if (issue.staleLevel === 'critical') {
                    staleIssues.push({ ...issue, repo: repo.name, org: orgName });
                }
            }
        }
    }
    stalePRs.sort((a, b) => b.ageDays - a.ageDays);
    staleIssues.sort((a, b) => b.ageDays - a.ageDays);
    return { stalePRs, staleIssues };
}

/**
 * Condensed markdown health report built from the dashboard JSON
 * (the output of collectDashboardData / a data-branch snapshot).
 */
export function generateReport(data) {
    const { stats, actionItems, organizations, missingMirrors, generatedAt } = data;
    const orgCount = Object.keys(organizations).length;
    const { stalePRs, staleIssues } = collectStaleItems(organizations);

    let report = `# Mage-OS Project Health Report
Generated: ${new Date(generatedAt).toUTCString()}

## Summary
- **${stats.totalRepos}** active repositories across ${orgCount} organizations
- **${stats.totalIssues}** open issues (${stats.staleIssues} stale >90d)
- **${stats.totalPRs}** open PRs (${stats.stalePRs} stale >30d)
`;

    if (actionItems.length > 0) {
        report += `\n## Top Action Items\n`;
        for (const [i, item] of actionItems.slice(0, MAX_ACTION_ITEMS).entries()) {
            const typeLabel = item.type === 'pr' ? 'PR' : 'Issue';
            const authorStr = item.author ? ` by ${escapeMarkdown(item.author)}` : '';
            const reviewStr = item.reviewStatus ? ` [${item.reviewStatus}]` : '';
            report += `${i + 1}. **${markdownLink(`${typeLabel}: ${item.title}`, item.url)}** in \`${item.repo}\` (${item.org}) — Score: ${item.priorityScore}/100${authorStr}${reviewStr}\n`;
            report += `   ${formatPriorityFactors(item.priorityFactors)}\n`;
        }
    }

    if (stalePRs.length > 0) {
        report += `\n## Stale PRs (>30 days)\n`;
        report += `| PR | Repository | Age | Author | Review Status |\n`;
        report += `|----|------------|-----|--------|---------------|\n`;
        for (const pr of stalePRs.slice(0, MAX_STALE_ROWS)) {
            report += `| ${markdownLink(pr.title, pr.url)} | ${pr.repo} (${pr.org}) | ${pr.ageDays}d | ${escapeMarkdown(pr.author) || '-'} | ${pr.reviewStatus} |\n`;
        }
        if (stalePRs.length > MAX_STALE_ROWS) {
            report += `\n*...and ${stalePRs.length - MAX_STALE_ROWS} more stale PRs*\n`;
        }
    }

    if (staleIssues.length > 0) {
        report += `\n## Stale Issues (>90 days)\n`;
        report += `| Issue | Repository | Age |\n`;
        report += `|-------|------------|-----|\n`;
        for (const issue of staleIssues.slice(0, MAX_STALE_ROWS)) {
            report += `| ${markdownLink(issue.title, issue.url)} | ${issue.repo} (${issue.org}) | ${issue.ageDays}d |\n`;
        }
        if (staleIssues.length > MAX_STALE_ROWS) {
            report += `\n*...and ${staleIssues.length - MAX_STALE_ROWS} more stale issues*\n`;
        }
    }

    if (missingMirrors.length > 0) {
        report += `\n## Missing Mirrors\n`;
        report += `${missingMirrors.length} Magento repositories without Mage-OS mirrors.\n`;
    }

    return report;
}
