import { writeFile, mkdir, readFile } from 'fs/promises';
import escapeHtml from 'escape-html';
import tinycolor from 'tinycolor2';

const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf-8'));
const GITHUB_ORGS = config.organizations;

function getDaysSince(dateString) {
    return Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
}

function getStaleClass(dateString) {
    const days = getDaysSince(dateString);
    if (days >= config.staleThresholds.criticalDays) return 'stale-critical';
    if (days >= config.staleThresholds.warningDays) return 'stale-warning';
    return '';
}

function formatAge(dateString) {
    const days = getDaysSince(dateString);
    if (days < 1) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

function getReviewStatusBadge(pr) {
    const lastReview = pr.reviews?.nodes?.[0];
    const pendingRequests = pr.reviewRequests?.totalCount || 0;

    if (lastReview) {
        switch (lastReview.state) {
            case 'APPROVED':
                return '<span class="review-badge review-approved" title="Approved">Approved</span>';
            case 'CHANGES_REQUESTED':
                return '<span class="review-badge review-changes" title="Changes Requested">Changes Requested</span>';
            case 'COMMENTED':
                return '<span class="review-badge review-commented" title="Reviewed">Reviewed</span>';
        }
    }
    if (pendingRequests > 0) {
        return '<span class="review-badge review-pending" title="Review Requested">Review Requested</span>';
    }
    return '<span class="review-badge review-none" title="No Review">No Review</span>';
}

function getWorkflowStatusIcon(conclusion) {
    const icons = {
        success: '<span class="ci-status ci-success" title="Success">&#x2705;</span>',
        failure: '<span class="ci-status ci-failure" title="Failure">&#x274C;</span>',
        cancelled: '<span class="ci-status ci-cancelled" title="Cancelled">&#x26D4;</span>',
        skipped: '<span class="ci-status ci-skipped" title="Skipped">&#x23ED;</span>',
        in_progress: '<span class="ci-status ci-running" title="In Progress">&#x1F504;</span>',
        queued: '<span class="ci-status ci-running" title="Queued">&#x1F504;</span>',
    };
    return icons[conclusion] || '<span class="ci-status" title="No runs">&#x2796;</span>';
}

function isLightColor(hex) {
    return tinycolor(hex).isLight();
}

async function fetchOrgData(orgName) {
    const query = `
    query ($org: String!, $cursor: String) {
      organization(login: $org) {
        repositories(first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            name
            url
            updatedAt
            isArchived
            defaultBranchRef {
              target {
                ... on Commit {
                  committedDate
                }
              }
            }
            vulnerabilityAlerts(states: OPEN) {
              totalCount
            }
            issues(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
              totalCount
              nodes {
                title
                url
                createdAt
                updatedAt
                labels(first: 5) {
                  nodes {
                    name
                    color
                  }
                }
              }
            }
            pullRequests(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
              totalCount
              nodes {
                title
                url
                createdAt
                updatedAt
                author {
                  login
                }
                reviews(last: 1) {
                  nodes {
                    state
                  }
                }
                reviewRequests(first: 1) {
                  totalCount
                }
              }
            }
          }
        }
      }
    }
  `;

    let allRepos = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const response = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables: { org: orgName, cursor } })
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.errors) {
            return result;
        }

        const repoData = result.data.organization.repositories;
        const nonArchived = repoData.nodes.filter(repo => !repo.isArchived);
        allRepos = allRepos.concat(nonArchived);
        hasNextPage = repoData.pageInfo.hasNextPage;
        cursor = repoData.pageInfo.endCursor;
    }

    return {
        data: {
            organization: {
                repositories: {
                    nodes: allRepos
                }
            }
        }
    };
}

function generateOrgSection(orgName, data) {
    const repos = data.data.organization.repositories.nodes;

    const activeRepos = repos.filter(repo =>
        repo.issues.totalCount > 0 || repo.pullRequests.totalCount > 0
    );

    if (activeRepos.length === 0) {
        return '';
    }

    const sectionId = `section-${orgName.replace(/[^a-zA-Z0-9]/g, '-')}`;
    return `
      <section class="mb-5">
        <h2 class="display-6 mb-4">
          <a class="text-decoration-none section-toggle" data-bs-toggle="collapse" href="#${sectionId}" role="button" aria-expanded="true" aria-controls="${sectionId}">
            ${escapeHtml(orgName)}
            <span class="collapse-icon"></span>
          </a>
        </h2>
        <div class="collapse show" id="${sectionId}">
        <div class="two-columns">
          ${activeRepos.map(repo => `
            <div class="col">
              <div class="card h-100">
                <div class="card-header">
                  <h2><a href="${escapeHtml(repo.url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></h2>
                </div>
                <div class="card-body">  
                  ${repo.issues.totalCount > 0 ? `
                    <h3 class="h6 table-title">Issues</h3>
                    <table class="table table-hover">
                      <tbody>
                        ${repo.issues.nodes.map(issue => `
                          <tr class="${getStaleClass(issue.updatedAt)}">
                            <td>
                              <a href="${escapeHtml(issue.url)}" class="text-decoration-none truncate-text" target="_blank" title="${escapeHtml(issue.title)}">${escapeHtml(issue.title)}</a>
                              <span class="item-age">${formatAge(issue.updatedAt)}</span>
                              ${issue.labels.nodes.length > 0 ? `
                                <div class="label-list">
                                  ${issue.labels.nodes.map(label => `<span class="label" style="background-color: #${escapeHtml(label.color)}; color: ${isLightColor(label.color) ? '#000' : '#fff'}">${escapeHtml(label.name)}</span>`).join('')}
                                </div>
                              ` : ''}
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : ''}
                  
                  ${repo.pullRequests.totalCount > 0 ? `
                    <h3 class="h6 table-title">Pull Requests</h3>
                    <table class="table table-hover">
                      <tbody>
                        ${repo.pullRequests.nodes.map(pr => `
                          <tr class="${getStaleClass(pr.updatedAt)}">
                            <td>
                              <a href="${escapeHtml(pr.url)}" class="text-decoration-none truncate-text" target="_blank" title="${escapeHtml(pr.title)}">${escapeHtml(pr.title)}</a>
                              ${pr.author ? `<span class="pr-author">by ${escapeHtml(pr.author.login)}</span>` : ''}
                              <span class="item-age">${formatAge(pr.updatedAt)}</span>
                              ${getReviewStatusBadge(pr)}
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        </div>
      </section>
    `;
}

async function generateWorkflowRunsSection(orgDataMap) {
    // Only get repositories from the mage-os organization
    const mageOsRepos = orgDataMap['mage-os']?.data?.organization?.repositories?.nodes || [];

    // Filter out archived repositories and sort alphabetically
    const sortedRepos = mageOsRepos
        .filter(repo => !repo.isArchived)
        .sort((a, b) => a.name.localeCompare(b.name));

    // Fetch workflow runs for each repository
    const reposWithRuns = await Promise.all(
        sortedRepos.map(async (repo) => {
            try {
                const runsData = await fetchWorkflowRunsForRepo('mage-os', repo.name);
                const lastRun = runsData.workflow_runs?.[0];
                return {
                    ...repo,
                    lastRunDate: lastRun ? new Date(lastRun.created_at) : null,
                    lastRunConclusion: lastRun?.conclusion || lastRun?.status || null
                };
            } catch (error) {
                console.error(`Error fetching workflow runs for ${repo.name}:`, error);
                return {
                    ...repo,
                    lastRunDate: null,
                    lastRunConclusion: null
                };
            }
        })
    );

    return `
    <section class="mb-5">
      <h2 class="display-6 mb-4">
        <a class="text-decoration-none section-toggle" data-bs-toggle="collapse" href="#section-repo-health" role="button" aria-expanded="true" aria-controls="section-repo-health">
          Repository Health
          <span class="collapse-icon"></span>
        </a>
      </h2>
      <div class="collapse show" id="section-repo-health">
      <table id="workflowRunsTable" class="table table-bordered table-hover sortable" style="width:auto">
        <thead>
          <tr>
            <th>Repository</th>
            <th>CI</th>
            <th>Last Workflow Run</th>
            <th>Last Commit</th>
            <th>Security Alerts</th>
          </tr>
        </thead>
        <tbody>
          ${reposWithRuns.map(repo => {
        const formattedDate = repo.lastRunDate
            ? repo.lastRunDate.toISOString().replace('T', ' ').substring(0, 19)
            : '-';
        const statusIcon = getWorkflowStatusIcon(repo.lastRunConclusion);
        const lastCommitDate = repo.defaultBranchRef?.target?.committedDate;
        const formattedCommitDate = lastCommitDate
            ? new Date(lastCommitDate).toISOString().replace('T', ' ').substring(0, 19)
            : '-';
        const alertCount = repo.vulnerabilityAlerts?.totalCount ?? null;
        const alertDisplay = alertCount === null ? '<span class="text-muted">N/A</span>'
            : alertCount === 0 ? '<span class="text-success">0</span>'
            : `<span class="text-danger fw-bold">${alertCount}</span>`;

        return `
              <tr>
                <td><a href="${escapeHtml(repo.url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></td>
                <td class="text-center">${statusIcon}</td>
                <td>${formattedDate}</td>
                <td>${formattedCommitDate}</td>
                <td class="text-center">${alertDisplay}</td>
              </tr>
            `;
    }).join('')}
        </tbody>
      </table>
      </div>
    </section>
  `;
}

async function fetchWorkflowRunsForRepo(owner, repo) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=1`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json'
        }
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return response.json();
}

async function fetchMagentoRepos() {
    let page = 1;
    let allRepos = [];
    let hasMoreRepos = true;

    while (hasMoreRepos) {
        const response = await fetch(`https://api.github.com/orgs/magento/repos?per_page=100&page=${page}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText} (Status: ${response.status})`);
        }

        const repos = await response.json();

        // If we received fewer repos than requested, this must be the last page
        if (repos.length < 100) {
            hasMoreRepos = false;
        }

        allRepos = [...allRepos, ...repos];
        page++;
    }

    // Filter out archived repositories
    return allRepos.filter(repo => !repo.archived);
}

async function generateMissingMirrorsSection(orgDataMap, ignoreList = []) {
    // Fetch all non-archived repositories from the Magento organization
    console.log('Fetching non-archived Magento repositories...');
    const magentoRepos = await fetchMagentoRepos();

    // Extract all Mage-OS repositories
    const mageOsRepos = orgDataMap['mage-os']?.data?.organization?.repositories?.nodes || [];

    // Create a Map of Magento repos for faster lookups
    const magentoReposMap = new Map(
        magentoRepos.map(repo => [repo.name, repo])
    );

    // Create a Set of mirrored repo names (without the "mirror-" prefix) for faster lookups
    const mirroredRepoNames = new Set(
        mageOsRepos
            .filter(repo => repo.name.startsWith('mirror-'))
            .map(repo => repo.name.substring(7))
    );

    // Create a Set of ignored repos for faster lookups
    const ignoredRepos = new Set(ignoreList);

    // Find repositories that don't have mirrors and aren't in the ignore list
    const unmirroredRepos = [];
    for (const [name, repo] of magentoReposMap.entries()) {
        if (!mirroredRepoNames.has(name) && !ignoredRepos.has(name)) {
            unmirroredRepos.push(repo);
        }
    }

    // Sort only once after filtering
    unmirroredRepos.sort((a, b) => a.name.localeCompare(b.name));

    // If no repositories need mirroring, return a message
    if (unmirroredRepos.length === 0) {
        return `
        <section class="mb-5">
          <h2 class="display-6 mb-4">Magento Repositories Without Mage-OS Mirrors</h2>
          <div class="alert alert-success">
            All necessary Magento repositories have been mirrored.
          </div>
        </section>
        `;
    }

    // Pre-compile the row generation function outside the loop
    const generateRow = repo => {
        const formattedDate = repo.updated_at
            ? new Date(repo.updated_at).toISOString().split('T')[0] + ' ' +
            new Date(repo.updated_at).toISOString().split('T')[1].substring(0, 8)
            : '-';

        return `
              <tr>
                <td><a href="${escapeHtml(repo.html_url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></td>
                <td>${formattedDate}</td>
              </tr>
            `;
    };

    // Build all rows at once and join
    const tableRows = unmirroredRepos.map(generateRow).join('');

    return `
    <section class="mb-5">
      <h2 class="display-6 mb-4">
        <a class="text-decoration-none section-toggle" data-bs-toggle="collapse" href="#section-missing-mirrors" role="button" aria-expanded="true" aria-controls="section-missing-mirrors">
          Magento Repositories Without Mage-OS Mirrors
          <span class="collapse-icon"></span>
        </a>
      </h2>
      <div class="collapse show" id="section-missing-mirrors">
      <table class="table table-bordered table-hover sortable" style="width:auto">
        <thead>
          <tr>
            <th>Repository</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      </div>
    </section>
  `;
}

function computeStats(orgDataMap) {
    let totalRepos = 0;
    let totalIssues = 0;
    let totalPRs = 0;
    let stalePRs = 0;
    let staleIssues = 0;
    let reposWithAlerts = 0;

    for (const data of Object.values(orgDataMap)) {
        const repos = data.data.organization.repositories.nodes;
        totalRepos += repos.length;
        for (const repo of repos) {
            totalIssues += repo.issues.totalCount;
            totalPRs += repo.pullRequests.totalCount;

            for (const issue of repo.issues.nodes) {
                if (getDaysSince(issue.updatedAt) >= config.staleThresholds.criticalDays) staleIssues++;
            }
            for (const pr of repo.pullRequests.nodes) {
                if (getDaysSince(pr.updatedAt) >= config.staleThresholds.warningDays) stalePRs++;
            }

            const alertCount = repo.vulnerabilityAlerts?.totalCount || 0;
            if (alertCount > 0) reposWithAlerts++;
        }
    }

    return { totalRepos, totalIssues, totalPRs, stalePRs, staleIssues, reposWithAlerts };
}

function generateSummarySection(stats) {
    const cards = [
        { label: 'Repositories', value: stats.totalRepos, color: 'primary' },
        { label: 'Open Issues', value: stats.totalIssues, color: 'info' },
        { label: 'Open PRs', value: stats.totalPRs, color: 'info' },
        { label: `Stale PRs (>${config.staleThresholds.warningDays}d)`, value: stats.stalePRs, color: stats.stalePRs > 0 ? 'warning' : 'success' },
        { label: `Stale Issues (>${config.staleThresholds.criticalDays}d)`, value: stats.staleIssues, color: stats.staleIssues > 0 ? 'danger' : 'success' },
        { label: 'Repos with Alerts', value: stats.reposWithAlerts, color: stats.reposWithAlerts > 0 ? 'danger' : 'success' },
    ];

    return `
      <section class="mb-4">
        <div class="row g-3">
          ${cards.map(card => `
            <div class="col-6 col-md-4 col-lg-2">
              <div class="card text-center border-${card.color}">
                <div class="card-body summary-card-body">
                  <div class="fs-2 fw-bold text-${card.color}">${card.value}</div>
                  <div class="text-muted small">${card.label}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
}

function generateHTML(summarySection, orgSections, missingMirrorsSection, workflowSection) {
    const lastUpdate = new Date().toISOString();

    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mage-OS Dashboard</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/gh/tofsjonas/sortable@latest/sortable.min.js" defer></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" defer></script>
        <style>
          body { 
            padding: 1rem;
          }
          
          .two-columns {
            max-width: 1400px;
            columns: 2;
            column-gap: 1.5rem;
          }
        
          .label { 
            display: inline-block;
            padding: 0.15rem 0.5rem;
            border-radius: 1rem;
            font-size: 0.75em;
            margin: 0.15rem 0.15rem 0.15rem 0;
          }
        
          .summary-card-body {
            padding: 0.75rem !important;
          }

          .last-update {
            color: #6c757d;
            font-size: 0.8em;
          }
        
          .card {
            height: 100%;
            break-inside: avoid;
            margin-bottom: 1.5rem;
            display: inline-block;
            width: 100%;
          }
          
          .card-header h2 {
            margin: 0;
            font-size: 1.25rem;
          }
          
          .card-body {
            padding: 0 !important;
          }
        
          .table {
            font-size: 0.9rem;
            margin-bottom: 0;
            table-layout: fixed;
          }
          
          .card .table {
            width: 100%;          
          }
        
          .card .table td {
            vertical-align: middle;
            width: 100%;
            max-width: 0;
          }

          .card .table:last-child tr:last-child td {
            border-bottom: none;
          }
        
          .card-body {
            padding: 1rem 0;
            padding-bottom: 0;
          }
        
          .table-title {
            padding: 0.5rem;
            margin-block: 1rem 0;
          }
        
          .stale-warning {
            background-color: #fff3cd !important;
          }

          .stale-critical {
            background-color: #f8d7da !important;
          }

          .item-age {
            font-size: 0.7em;
            color: #6c757d;
            white-space: nowrap;
          }

          .stale-warning .item-age {
            color: #856404;
          }

          .stale-critical .item-age {
            color: #721c24;
          }

          .review-badge {
            display: inline-block;
            padding: 0.1rem 0.4rem;
            border-radius: 0.25rem;
            font-size: 0.7em;
            font-weight: 500;
            margin-left: 0.25rem;
          }

          .review-approved { background-color: #d4edda; color: #155724; }
          .review-changes { background-color: #f8d7da; color: #721c24; }
          .review-commented { background-color: #d1ecf1; color: #0c5460; }
          .review-pending { background-color: #fff3cd; color: #856404; }
          .review-none { background-color: #e2e3e5; color: #383d41; }

          .pr-author {
            font-size: 0.75em;
            color: #6c757d;
            margin-left: 0.25rem;
          }

          .label-list {
            margin-top: 0.15rem;
          }

          .truncate-text {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
          }
          
          .section-toggle {
            color: inherit;
          }

          .section-toggle .collapse-icon::after {
            content: " \\25B2";
            font-size: 0.6em;
            vertical-align: middle;
          }

          .section-toggle.collapsed .collapse-icon::after {
            content: " \\25BC";
          }

          .sortable th {
            cursor: pointer;
          }
          .sortable th[aria-sort=ascending]::after {
            content: " ▲";
          }
          .sortable th[aria-sort=descending]::after {
            content: " ▼";
          }
        </style>
      </head>
      <body>
        <div class="container">
          <header class="mb-4">
            <h1 class="display-5">Mage-OS Dashboard</h1>
            <p class="last-update">Last updated: ${new Date(lastUpdate).toLocaleString()}</p>
          </header>
          
          ${summarySection}

          <div class="mb-4">
            <input type="text" id="dashboardSearch" class="form-control" placeholder="Filter by repository, issue, PR, author, or label...">
          </div>

          ${orgSections}
          ${missingMirrorsSection}
          ${workflowSection}
        </div>
        <script>
          document.getElementById('dashboardSearch').addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();

            // Filter repo cards in org sections
            document.querySelectorAll('.two-columns .col').forEach(function(col) {
              const text = col.textContent.toLowerCase();
              col.style.display = !query || text.includes(query) ? '' : 'none';
            });

            // Filter table rows in sortable tables
            document.querySelectorAll('table.sortable tbody tr').forEach(function(row) {
              const text = row.textContent.toLowerCase();
              row.style.display = !query || text.includes(query) ? '' : 'none';
            });
          });
        </script>
      </body>
    </html>
  `;
}

async function main() {
    try {
        console.log(`Fetching data for organizations: ${GITHUB_ORGS.join(', ')}...`);
        const orgResults = await Promise.all(
            GITHUB_ORGS.map(async (orgName) => {
                try {
                    const data = await fetchOrgData(orgName);
                    if (data.errors) {
                        console.error(`Error fetching data for ${orgName}:`, data.errors);
                        return [orgName, null];
                    }
                    return [orgName, data];
                } catch (error) {
                    console.error(`Error fetching data for ${orgName}:`, error);
                    return [orgName, null];
                }
            })
        );
        const orgDataMap = Object.fromEntries(orgResults.filter(([, data]) => data !== null));

        if (Object.keys(orgDataMap).length === 0) {
            throw new Error('No organization data was successfully retrieved');
        }

        const stats = computeStats(orgDataMap);
        const summarySection = generateSummarySection(stats);

        let orgSections = '';
        for (const [orgName, data] of Object.entries(orgDataMap)) {
            orgSections += generateOrgSection(orgName, data);
        }

        const missingMirrorsSection = await generateMissingMirrorsSection(orgDataMap, config.missingMirrorsIgnoreList);
        const workflowSection = await generateWorkflowRunsSection(orgDataMap);

        const html = generateHTML(summarySection, orgSections, missingMirrorsSection, workflowSection);

        await mkdir('dist', { recursive: true });
        await writeFile('dist/index.html', html);
        console.log('Dashboard generated successfully!');
    } catch (error) {
        console.error('Error generating dashboard:', error);
        process.exit(1);
    }
}

main();
