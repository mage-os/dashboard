import escapeHtml from 'escape-html';
import { getStaleClass, formatAge, formatDateUTC, isLightColor } from './utils.js';
import { SITE_RESOURCES, DATA_BRANCH_URL, SOURCE_REPO_URL } from './agent-resources.js';
import { generateReviewQueueSection, generateReviewQueueTeaser, generateReviewQueueStyles, generateReviewQueueScript } from './review-queue-html.js';

export { generateReviewQueueSection, generateReviewQueueTeaser };

const GITHUB_MARK_PATH = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

export function generateSourceLink() {
    return `<a href="${escapeHtml(SOURCE_REPO_URL)}" class="btn btn-outline-dark btn-sm source-link" target="_blank" rel="noopener" title="Source code of this dashboard">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="${GITHUB_MARK_PATH}"></path></svg>
              mage-os/dashboard
            </a>`;
}

export function generateAgentHeadLinks() {
    return SITE_RESOURCES
        .filter(r => r.type !== 'text/plain')
        .map(r => `<link rel="alternate" type="${r.type}" href="${escapeHtml(r.path)}" title="${escapeHtml(r.title)}">`)
        .join('\n        ');
}

export function generateAgentNotice() {
    const links = SITE_RESOURCES
        .map(r => `<a href="${escapeHtml(r.path)}" title="${escapeHtml(r.description)}">${escapeHtml(r.title)}</a>`)
        .concat(`<a href="${escapeHtml(DATA_BRANCH_URL)}" title="Historical JSON snapshots and reports">History (data branch)</a>`);
    return `<p class="agent-notice small text-muted">For AI agents and scripts: ${links.join(' &middot; ')}</p>`;
}

export function getReviewStatusBadge(pr) {
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

export function getWorkflowStatusIcon(conclusion) {
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

function generateIssueRow(issue, config) {
    return `
      <tr class="${getStaleClass(issue.updatedAt, config.staleThresholds)}">
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
    `;
}

function generatePullRequestRow(pr, config) {
    return `
      <tr class="${getStaleClass(pr.updatedAt, config.staleThresholds)}">
        <td>
          <a href="${escapeHtml(pr.url)}" class="text-decoration-none truncate-text" target="_blank" title="${escapeHtml(pr.title)}">${escapeHtml(pr.title)}</a>
          ${pr.author ? `<span class="pr-author">by ${escapeHtml(pr.author.login)}</span>` : ''}
          <span class="item-age">${formatAge(pr.updatedAt)}</span>
          ${getReviewStatusBadge(pr)}
        </td>
      </tr>
    `;
}

export function generateOrgSection(orgName, data, config) {
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
          ${activeRepos.map(repo => `
            <div class="repo-card">
              <div class="card mb-3">
                <div class="card-header">
                  <h2><a href="${escapeHtml(repo.url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></h2>
                </div>
                <div class="card-body">
                  <div class="row g-0 repo-split">
                    <div class="col-lg-6 repo-col repo-col-issues">
                      ${repo.issues.totalCount > 0 ? `
                        <h3 class="h6 table-title">Issues</h3>
                        <table class="table table-hover">
                          <tbody>
                            ${repo.issues.nodes.map(issue => generateIssueRow(issue, config)).join('')}
                          </tbody>
                        </table>
                      ` : '<div class="empty-col text-muted small">No open issues</div>'}
                    </div>
                    <div class="col-lg-6 repo-col repo-col-prs">
                      ${repo.pullRequests.totalCount > 0 ? `
                        <h3 class="h6 table-title">Pull Requests</h3>
                        <table class="table table-hover">
                          <tbody>
                            ${repo.pullRequests.nodes.map(pr => generatePullRequestRow(pr, config)).join('')}
                          </tbody>
                        </table>
                      ` : '<div class="empty-col text-muted small">No open pull requests</div>'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
}

export function generateRecentActivitySection(orgDataMap, limit = 15) {
    const items = [];
    for (const [orgName, data] of Object.entries(orgDataMap)) {
        const repos = data.data.organization.repositories.nodes;
        for (const repo of repos) {
            for (const issue of repo.issues.nodes) {
                items.push({
                    type: 'issue',
                    title: issue.title,
                    url: issue.url,
                    updatedAt: issue.updatedAt,
                    repo: repo.name,
                    org: orgName,
                    author: null
                });
            }
            for (const pr of repo.pullRequests.nodes) {
                items.push({
                    type: 'pr',
                    title: pr.title,
                    url: pr.url,
                    updatedAt: pr.updatedAt,
                    repo: repo.name,
                    org: orgName,
                    author: pr.author?.login || null
                });
            }
        }
    }

    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const recent = items.slice(0, limit);

    if (recent.length === 0) {
        return '';
    }

    const rows = recent.map(item => {
        const typeBadge = item.type === 'pr'
            ? '<span class="activity-type activity-type-pr">PR</span>'
            : '<span class="activity-type activity-type-issue">Issue</span>';
        const author = item.author ? `<span class="pr-author">by ${escapeHtml(item.author)}</span>` : '';
        return `
          <tr>
            <td class="activity-type-cell">${typeBadge}</td>
            <td class="activity-repo">${escapeHtml(item.org)}/${escapeHtml(item.repo)}</td>
            <td>
              <a href="${escapeHtml(item.url)}" class="text-decoration-none truncate-text" target="_blank" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</a>
              ${author}
            </td>
            <td class="activity-age"><span class="item-age">${formatAge(item.updatedAt)}</span></td>
          </tr>
        `;
    }).join('');

    return `
      <section class="mb-5">
        <h2 class="display-6 mb-4">
          <a class="text-decoration-none section-toggle" data-bs-toggle="collapse" href="#section-recent-activity" role="button" aria-expanded="true" aria-controls="section-recent-activity">
            Recent Activity
            <span class="collapse-icon"></span>
          </a>
        </h2>
        <div class="collapse show" id="section-recent-activity">
          <table class="table table-hover recent-activity-table">
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
}

export function generateWorkflowRunsSectionFromData(reposWithRuns) {
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
          </tr>
        </thead>
        <tbody>
          ${reposWithRuns.map(repo => {
        const formattedDate = repo.lastRunDate
            ? formatDateUTC(repo.lastRunDate.toISOString())
            : '-';
        const statusIcon = getWorkflowStatusIcon(repo.lastRunConclusion);
        const lastCommitDate = repo.defaultBranchRef?.target?.committedDate;
        const formattedCommitDate = formatDateUTC(lastCommitDate);

        return `
              <tr>
                <td><a href="${escapeHtml(repo.url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></td>
                <td class="text-center">${statusIcon}</td>
                <td>${formattedDate}</td>
                <td>${formattedCommitDate}</td>
              </tr>
            `;
    }).join('')}
        </tbody>
      </table>
      </div>
    </section>
  `;
}

export function generateMissingMirrorsSectionFromData(unmirroredRepos) {
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

    const generateRow = repo => {
        const formattedDate = formatDateUTC(repo.updated_at);

        return `
              <tr>
                <td><a href="${escapeHtml(repo.html_url)}" class="text-decoration-none" target="_blank">${escapeHtml(repo.name)}</a></td>
                <td>${formattedDate}</td>
              </tr>
            `;
    };

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

export function generateSummarySection(stats, config) {
    const cards = [
        { label: 'Repositories', value: stats.totalRepos, color: 'primary' },
        { label: 'Open Issues', value: stats.totalIssues, color: 'info' },
        { label: 'Open PRs', value: stats.totalPRs, color: 'info' },
        { label: `Stale PRs (>${config.staleThresholds.warningDays}d)`, value: stats.stalePRs, color: stats.stalePRs > 0 ? 'warning' : 'success' },
        { label: `Stale Issues (>${config.staleThresholds.criticalDays}d)`, value: stats.staleIssues, color: stats.staleIssues > 0 ? 'danger' : 'success' },
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

const PAGES = {
    overview: { path: '/', label: 'Overview' },
    reviews: { path: '/reviews/', label: 'PR Review Queue' }
};

const OVERVIEW_DESCRIPTION = 'Open issues, pull requests, CI health, and mirror coverage for the Mage-OS GitHub organizations. Machine-readable versions: /index.md, /dashboard-data.json, /llms.txt.';
const REVIEWS_DESCRIPTION = 'Open pull requests in the Mage-OS GitHub organization with age, comments, size and approval status. Machine-readable versions: /index.md, /dashboard-data.json, /llms.txt.';

export function generateNav(activePage) {
    const items = Object.entries(PAGES).map(([page, { path, label }]) => {
        const isActive = page === activePage;
        return `<li class="nav-item"><a class="nav-link${isActive ? ' active' : ''}" href="${path}"${isActive ? ' aria-current="page"' : ''}>${label}</a></li>`;
    });
    return `<nav aria-label="Dashboard pages"><ul class="nav nav-pills mb-3">${items.join('')}</ul></nav>`;
}

function generatePage({ title, description, activePage, content }) {
    const lastUpdate = formatDateUTC(new Date().toISOString());

    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(title)}</title>
        <meta name="description" content="${escapeHtml(description)}">
        ${generateAgentHeadLinks()}
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/gh/tofsjonas/sortable@latest/sortable.min.js" defer></script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" defer></script>
        <style>
          body {
            padding: 1rem;
          }
          ${generateReviewQueueStyles()}
          .repo-card {
            max-width: 1400px;
          }

          .repo-split > .repo-col + .repo-col {
            border-top: 1px solid rgba(0, 0, 0, 0.125);
          }

          @media (min-width: 992px) {
            .repo-split > .repo-col + .repo-col {
              border-top: none;
              border-left: 1px solid rgba(0, 0, 0, 0.125);
            }
          }

          .repo-col .table-title {
            background-color: rgba(0, 0, 0, 0.02);
          }

          .empty-col {
            padding: 1rem;
            font-style: italic;
          }

          .activity-type {
            display: inline-block;
            padding: 0.1rem 0.4rem;
            border-radius: 0.25rem;
            font-size: 0.7em;
            font-weight: 500;
            min-width: 2.5rem;
            text-align: center;
          }
          .activity-type-issue { background-color: #d1ecf1; color: #0c5460; }
          .activity-type-pr { background-color: #e2d9f3; color: #3d2a6c; }

          .recent-activity-table {
            max-width: 1400px;
            font-size: 0.9rem;
          }
          .recent-activity-table td {
            vertical-align: middle;
          }
          .recent-activity-table .activity-type-cell {
            width: 3.5rem;
          }
          .recent-activity-table .activity-repo {
            white-space: nowrap;
            font-family: monospace;
            font-size: 0.85em;
            color: #495057;
          }
          .recent-activity-table .activity-age {
            white-space: nowrap;
            width: 1%;
          }

          .source-link svg {
            vertical-align: -2px;
            margin-right: 0.25rem;
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
          .sortable th:focus-visible {
            outline: 2px solid #0d6efd;
            outline-offset: -2px;
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
          <header class="mb-3">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h1 class="display-5 mb-0">Mage-OS Dashboard</h1>
              ${generateSourceLink()}
            </div>
            <p class="last-update">Last updated: ${lastUpdate}</p>
            ${generateAgentNotice()}
          </header>
          ${generateNav(activePage)}

          ${content}
        </div>
        <script>
          ${generateReviewQueueScript()}

          window.addEventListener('load', function () {
            document.querySelectorAll('table.sortable th').forEach(function (th) {
              th.tabIndex = 0;
              th.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                th.click();
              });
            });
          });

          (function () {
            var dashboardSearch = document.getElementById('dashboardSearch');
            if (!dashboardSearch) return;
            dashboardSearch.addEventListener('input', function (e) {
              var query = e.target.value.toLowerCase().trim();

              document.querySelectorAll('.repo-card').forEach(function (card) {
                var text = card.textContent.toLowerCase();
                card.style.display = !query || text.includes(query) ? '' : 'none';
              });

              document.querySelectorAll('table.sortable:not(.review-queue-table) tbody tr').forEach(function (row) {
                var text = row.textContent.toLowerCase();
                row.style.display = !query || text.includes(query) ? '' : 'none';
              });
            });
          })();
        </script>
      </body>
    </html>
  `;
}

export function generateHTML(summarySection, orgSections, missingMirrorsSection, workflowSection, recentActivitySection = '', reviewQueueTeaser = '') {
    return generatePage({
        title: 'Mage-OS Dashboard',
        description: OVERVIEW_DESCRIPTION,
        activePage: 'overview',
        content: `
          ${summarySection}

          ${reviewQueueTeaser}

          ${recentActivitySection}

          <div class="mb-4">
            <input type="text" id="dashboardSearch" class="form-control" placeholder="Filter by repository, issue, PR, author, or label...">
          </div>

          ${orgSections}
          ${missingMirrorsSection}
          ${workflowSection}`
    });
}

export function generateReviewQueuePage(reviewQueueSection) {
    return generatePage({
        title: 'PR Review Queue · Mage-OS Dashboard',
        description: REVIEWS_DESCRIPTION,
        activePage: 'reviews',
        content: reviewQueueSection
    });
}
