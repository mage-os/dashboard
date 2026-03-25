const ORG_QUERY = `
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

function createGitHubHeaders(token) {
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
    };
}

export async function fetchOrgData(orgName, token) {
    let allRepos = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const response = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: createGitHubHeaders(token),
            body: JSON.stringify({ query: ORG_QUERY, variables: { org: orgName, cursor } })
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

export async function fetchWorkflowRunsForRepo(owner, repo, token) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=1`, {
        method: 'GET',
        headers: createGitHubHeaders(token)
    });

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return response.json();
}

export async function fetchMagentoRepos(token) {
    let page = 1;
    let allRepos = [];
    let hasMoreRepos = true;

    while (hasMoreRepos) {
        const response = await fetch(`https://api.github.com/orgs/magento/repos?per_page=100&page=${page}`, {
            method: 'GET',
            headers: createGitHubHeaders(token)
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText} (Status: ${response.status})`);
        }

        const repos = await response.json();

        if (repos.length < 100) {
            hasMoreRepos = false;
        }

        allRepos = [...allRepos, ...repos];
        page++;
    }

    return allRepos.filter(repo => !repo.archived);
}
