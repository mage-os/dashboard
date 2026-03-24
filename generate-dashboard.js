import { writeFile, mkdir, readFile } from 'fs/promises';

const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf-8'));
const GITHUB_ORGS = config.organizations;

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
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

    return `
      <section class="mb-5">
        <h2 class="display-6 mb-4">${escapeHtml(orgName)}</h2>
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
      <h2 class="display-6 mb-4">Workflow Runs</h2>
      <table id="workflowRunsTable" class="table table-bordered table-hover sortable" style="width:auto">
        <thead>
          <tr>
            <th>Repository</th>
            <th>Status</th>
            <th>Last Workflow Run</th>
          </tr>
        </thead>
        <tbody>
          ${reposWithRuns.map(repo => {
        const formattedDate = repo.lastRunDate
            ? repo.lastRunDate.toISOString().replace('T', ' ').substring(0, 19)
            : '-';
        const statusIcon = getWorkflowStatusIcon(repo.lastRunConclusion);

        return `
              <tr>
                <td><a href="${escapeHtml(repo.url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></td>
                <td class="text-center">${statusIcon}</td>
                <td>${formattedDate}</td>
              </tr>
            `;
    }).join('')}
        </tbody>
      </table>
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
      <h2 class="display-6 mb-4">Magento Repositories Without Mage-OS Mirrors</h2>
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
    </section>
  `;
}

function generateHTML(orgSections, missingMirrorsSection, workflowSection) {
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
          
          ${orgSections}
          ${missingMirrorsSection}
          ${workflowSection}
        </div>
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

        let orgSections = '';
        for (const [orgName, data] of Object.entries(orgDataMap)) {
            orgSections += generateOrgSection(orgName, data);
        }

        const missingMirrorsSection = await generateMissingMirrorsSection(orgDataMap, config.missingMirrorsIgnoreList);
        const workflowSection = await generateWorkflowRunsSection(orgDataMap);

        const html = generateHTML(orgSections, missingMirrorsSection, workflowSection);

        await mkdir('dist', { recursive: true });
        await writeFile('dist/index.html', html);
        console.log('Dashboard generated successfully!');
    } catch (error) {
        console.error('Error generating dashboard:', error);
        process.exit(1);
    }
}

main();
