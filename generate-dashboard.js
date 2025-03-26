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
            workflowRuns(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
              nodes {
                createdAt
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

function generateWorkflowRunsSection(orgDataMap) {
    // Only get repositories from the mage-os organization
    const mageOsRepos = orgDataMap['mage-os']?.data?.organization?.repositories?.nodes || [];

    // Filter out archived repositories and sort alphabetically
    const sortedRepos = mageOsRepos
        .filter(repo => !repo.isArchived)
        .sort((a, b) => a.name.localeCompare(b.name));

    return `
    <section class="mb-5">
      <h2 class="display-6 mb-4">Workflow Runs</h2>
      <table id="workflowRunsTable" class="table table-hover sortable">
        <thead>
          <tr>
            <th>Repository</th>
            <th>Last Workflow Run</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRepos.map(repo => {
        const lastRunDate = repo.workflowRuns.nodes[0]
            ? new Date(repo.workflowRuns.nodes[0].createdAt)
            : null;

        // Format the date as YYYY-MM-DD HH:MM:SS
        const formattedDate = lastRunDate
            ? lastRunDate.toISOString().replace('T', ' ').substring(0, 19)
            : 'N/A';

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

function generateHTML(orgDataMap) {
    const lastUpdate = new Date().toISOString();
    
    let orgSections = '';
    for (const [orgName, data] of Object.entries(orgDataMap)) {
        orgSections += generateOrgSection(orgName, data);
    }

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
            width: 100%;
          }
        
          .table td {
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
          .sortable th.asc::after {
            content: " ▲";
          }
          .sortable th.desc::after {
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
          ${generateWorkflowRunsSection(orgDataMap)}
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
    
    const html = generateHTML(orgDataMap);
    
    await mkdir('dist', { recursive: true });
    await writeFile('dist/index.html', html);
    console.log('Dashboard generated successfully!');
  } catch (error) {
    console.error('Error generating dashboard:', error);
    process.exit(1);
  }
}

main();
