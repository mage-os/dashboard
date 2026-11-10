// Single source of truth for the machine-readable resources the dashboard
// advertises to agents (HTML <link>s, visible links, llms.txt, index.md, _headers).

export const SOURCE_REPO_URL = 'https://github.com/mage-os/dashboard';
export const DATA_BRANCH_URL = `${SOURCE_REPO_URL}/tree/data`;
export const DATA_BRANCH_RAW_URL = 'https://raw.githubusercontent.com/mage-os/dashboard/data';
export const DATA_BRANCH_API_URL = 'https://api.github.com/repos/mage-os/dashboard/contents/snapshots?ref=data';

// Files published next to index.html. Paths are root-relative so they resolve
// the same whether the page is requested as `/`, `/index.html`, or `/index.md`.
export const SITE_RESOURCES = [
    {
        path: '/index.md',
        type: 'text/markdown',
        title: 'Markdown',
        description: 'Full dashboard as Markdown: everything on the HTML page'
    },
    {
        path: '/dashboard-data.json',
        type: 'application/json',
        title: 'JSON',
        description: 'Complete structured dashboard state: stats, per-repo issues and PRs, priority-scored action items, missing mirrors'
    },
    {
        path: '/report.md',
        type: 'text/markdown',
        title: 'Summary report',
        description: 'Condensed health report: top action items, oldest stale PRs and issues'
    },
    {
        path: '/llms.txt',
        type: 'text/plain',
        title: 'llms.txt',
        description: 'Index of agent-friendly resources for this dashboard'
    }
];

export const HISTORY_RESOURCES = [
    {
        url: `${DATA_BRANCH_RAW_URL}/latest.json`,
        title: 'latest.json',
        description: 'Most recent snapshot (same schema as /dashboard-data.json)'
    },
    {
        url: `${DATA_BRANCH_RAW_URL}/latest-report.md`,
        title: 'latest-report.md',
        description: 'Most recent summary report'
    },
    {
        url: `${DATA_BRANCH_RAW_URL}/snapshots/YYYY/MM/YYYY-MM-DD-HH.json`,
        title: 'snapshots/YYYY/MM/YYYY-MM-DD-HH.json',
        description: 'Historical snapshots, archived roughly every 3 hours (UTC timestamp in the filename)'
    },
    {
        url: DATA_BRANCH_API_URL,
        title: 'Snapshot index (GitHub API)',
        description: 'List snapshot years; append /YYYY or /YYYY/MM to the path to list deeper'
    },
    {
        url: DATA_BRANCH_URL,
        title: 'data branch',
        description: 'Browse the historical archive on GitHub'
    }
];
