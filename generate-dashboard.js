import { writeFile } from 'fs/promises';
import { mkdir } from 'fs/promises';

const GITHUB_ORG = 'mage-os';

async function fetchOrgData() {
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
        body: JSON.stringify({ query, variables: { org: GITHUB_ORG } })
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const result = await response.json();
    // Filter out archived repositories
    result.data.organization.repositories.nodes = result.data.organization.repositories.nodes.filter(repo => !repo.isArchived);
    return result;
}

function generateHTML(data) {
    const repos = data.data.organization.repositories.nodes;
    const lastUpdate = new Date().toISOString();

    const activeRepos = repos.filter(repo =>
        repo.issues.totalCount > 0 || repo.pullRequests.totalCount > 0
    );

    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mage-OS Dashboard</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
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
        </style>
      </head>
      <body>
        <div class="container">
          <header class="mb-4">
            <h1 class="display-6">Mage-OS Dashboard</h1>
            <p class="last-update">Last updated: ${new Date(lastUpdate).toLocaleString()}</p>
          </header>
          
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
        </div>
      </body>
    </html>
  `;
}

async function main() {
  try {
    const data = await fetchOrgData();
    const html = generateHTML(data);
    
    await mkdir('dist', { recursive: true });
    await writeFile('dist/index.html', html);
    console.log('Dashboard generated successfully!');
  } catch (error) {
    console.error('Error generating dashboard:', error);
    process.exit(1);
  }
}

main();
