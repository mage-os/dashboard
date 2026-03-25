import { readFile, writeFile, mkdir } from 'fs/promises';

const data = JSON.parse(await readFile('dist/dashboard-data.json', 'utf-8'));

function formatFactors(factors) {
    return Object.entries(factors)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
}

const { stats, actionItems, organizations, missingMirrors, generatedAt } = data;
const orgCount = Object.keys(organizations).length;

// Find repos with security alerts
const securityRepos = [];
for (const [orgName, org] of Object.entries(organizations)) {
    for (const repo of org.repositories) {
        if (repo.securityAlertCount > 0) {
            const relatedPRs = repo.pullRequests.length;
            securityRepos.push({ name: repo.name, org: orgName, alerts: repo.securityAlertCount, openPRs: relatedPRs });
        }
    }
}

// Collect stale PRs and issues
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

// Build report
let report = `# Mage-OS Project Health Report
Generated: ${new Date(generatedAt).toUTCString()}

## Summary
- **${stats.totalRepos}** active repositories across ${orgCount} organizations
- **${stats.totalIssues}** open issues (${stats.staleIssues} stale >90d)
- **${stats.totalPRs}** open PRs (${stats.stalePRs} stale >30d)
- **${stats.reposWithAlerts}** repos with security alerts
`;

// Action items
if (actionItems.length > 0) {
    report += `\n## Top Action Items\n`;
    for (const [i, item] of actionItems.slice(0, 10).entries()) {
        const typeLabel = item.type === 'pr' ? 'PR' : 'Issue';
        const authorStr = item.author ? ` by ${item.author}` : '';
        const reviewStr = item.reviewStatus ? ` [${item.reviewStatus}]` : '';
        report += `${i + 1}. **[${typeLabel}: ${item.title}](${item.url})** in \`${item.repo}\` (${item.org}) — Score: ${item.priorityScore}/100${authorStr}${reviewStr}\n`;
        report += `   ${formatFactors(item.priorityFactors)}\n`;
    }
}

// Security alerts
if (securityRepos.length > 0) {
    report += `\n## Security Alerts\n`;
    report += `| Repository | Org | Alerts | Open PRs |\n`;
    report += `|------------|-----|--------|----------|\n`;
    for (const repo of securityRepos) {
        report += `| ${repo.name} | ${repo.org} | ${repo.alerts} | ${repo.openPRs} |\n`;
    }
}

// Stale PRs
if (stalePRs.length > 0) {
    report += `\n## Stale PRs (>30 days)\n`;
    report += `| PR | Repository | Age | Author | Review Status |\n`;
    report += `|----|------------|-----|--------|---------------|\n`;
    for (const pr of stalePRs.slice(0, 20)) {
        report += `| [${pr.title}](${pr.url}) | ${pr.repo} (${pr.org}) | ${pr.ageDays}d | ${pr.author || '-'} | ${pr.reviewStatus} |\n`;
    }
    if (stalePRs.length > 20) {
        report += `\n*...and ${stalePRs.length - 20} more stale PRs*\n`;
    }
}

// Stale issues
if (staleIssues.length > 0) {
    report += `\n## Stale Issues (>90 days)\n`;
    report += `| Issue | Repository | Age |\n`;
    report += `|-------|------------|-----|\n`;
    for (const issue of staleIssues.slice(0, 20)) {
        report += `| [${issue.title}](${issue.url}) | ${issue.repo} (${issue.org}) | ${issue.ageDays}d |\n`;
    }
    if (staleIssues.length > 20) {
        report += `\n*...and ${staleIssues.length - 20} more stale issues*\n`;
    }
}

// Missing mirrors
if (missingMirrors.length > 0) {
    report += `\n## Missing Mirrors\n`;
    report += `${missingMirrors.length} Magento repositories without Mage-OS mirrors.\n`;
}

await mkdir('dist', { recursive: true });
await writeFile('dist/report.md', report);
console.log('Report generated: dist/report.md');
