import { writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';

const GITHUB_ORGS = ['mage-os', 'mage-os-lab'];

async function fetchOrgData(orgName) {
    const query = `
    query ($org: String!) {
      organization(login: $org) {
        repositories(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
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

    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { org: orgName } })
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Filter out archived repositories
    if (result.data && result.data.organization) {
        result.data.organization.repositories.nodes = result.data.organization.repositories.nodes.filter(repo => !repo.isArchived);
    }
    
    return result;
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
        <h2 class="display-6 mb-4">${orgName}</h2>
        <div class="two-columns">
          ${activeRepos.map(repo => `
            <div class="col">
              <div class="card h-100">
                <div class="card-header">
                  <h2><a href="${repo.url}" class="text-decoration-none" target="_blank">${repo.name}</a></h2>
                </div>
                <div class="card-body">  
                  ${repo.issues.totalCount > 0 ? `
                    <h3 class="h6 table-title">Issues</h3>
                    <table class="table table-hover">
                      <tbody>
                        ${repo.issues.nodes.map(issue => `
                          <tr>
                            <td>
                              <a href="${issue.url}" class="text-decoration-none truncate-text" target="_blank" title="${issue.title}">${issue.title}</a>
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
                          <tr>
                            <td>
                              <a href="${pr.url}" class="text-decoration-none truncate-text" target="_blank" title="${pr.title}">${pr.title}</a>
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
                return {
                    ...repo,
                    lastRunDate: runsData.workflow_runs && runsData.workflow_runs.length > 0
                        ? new Date(runsData.workflow_runs[0].created_at)
                        : null
                };
            } catch (error) {
                console.error(`Error fetching workflow runs for ${repo.name}:`, error);
                return {
                    ...repo,
                    lastRunDate: null
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
            <th>Last Workflow Run</th>
          </tr>
        </thead>
        <tbody>
          ${reposWithRuns.map(repo => {
        const formattedDate = repo.lastRunDate
            ? repo.lastRunDate.toISOString().replace('T', ' ').substring(0, 19)
            : '-';

        return `
              <tr>
                <td><a href="${repo.url}" class="text-decoration-none" target="_blank">${repo.name}</a></td>
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
                <td><a href="${repo.html_url}" class="text-decoration-none" target="_blank">${repo.name}</a></td>
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
        const orgDataMap = {};

        for (const orgName of GITHUB_ORGS) {
            console.log(`Fetching data for ${orgName}...`);
            const data = await fetchOrgData(orgName);

            if (data.errors) {
                console.error(`Error fetching data for ${orgName}:`, data.errors);
                continue; // Skip this org but continue with others
            }

            orgDataMap[orgName] = data;
        }

        if (Object.keys(orgDataMap).length === 0) {
            throw new Error('No organization data was successfully retrieved');
        }

        let orgSections = '';
        for (const [orgName, data] of Object.entries(orgDataMap)) {
            orgSections += generateOrgSection(orgName, data);
        }

        const missingMirrorsIgnoreList = [
            'adobe-commerce-catalog-service', 'aep-launch', 'app-builder-samples', 'architecture', 'baler',
            'catalog-storefront', 'community-engineering', 'community-features', 'CssXPath', 'devdocs',
            'devops-cla-test-public', 'directive-parser', 'Dom', 'ece-tools', 'graphql', 'language-ja_JP',
            'm2-baler', 'm2-devtools', 'magento-cloud', 'magento-cloud-components', 'magento-cloud-docker',
            'magento-coding-standard', 'magento-eslint', 'magento-japan-tax', 'magento-vcs-installer',
            'magento2-jp', 'magento2-phpstorm-plugin', 'magento2-pwa', 'magento2-pwa-commerce',
            'magento2-upward-connector', 'marketplace-eqp', 'marketplace-subscriptions', 'meta-for-magento2',
            'module-grpc', 'php-proto-generator', 'pwa-studio', 'pwa-tests', 'storefront-authentication-ce',
            'storefront-message-broker', 'storefront-pricing-ce', 'storefront-product-reviews-ce',
            'storefront-search-ce', 'ts-types', 'upward-php'
        ];
        const missingMirrorsSection = await generateMissingMirrorsSection(orgDataMap, missingMirrorsIgnoreList);
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
