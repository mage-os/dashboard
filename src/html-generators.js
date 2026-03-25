import escapeHtml from 'escape-html';
import { getStaleClass, formatAge, formatDateUTC, isLightColor } from './utils.js';

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
                        `).join('')}
                      </tbody>
                    </table>
                  ` : ''}

                  ${repo.pullRequests.totalCount > 0 ? `
                    <h3 class="h6 table-title">Pull Requests</h3>
                    <table class="table table-hover">
                      <tbody>
                        ${repo.pullRequests.nodes.map(pr => `
                          <tr class="${getStaleClass(pr.updatedAt, config.staleThresholds)}">
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

export function generateHTML(summarySection, orgSections, missingMirrorsSection, workflowSection) {
    const lastUpdate = formatDateUTC(new Date().toISOString());

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
            <p class="last-update">Last updated: ${lastUpdate}</p>
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
