import escapeHtml from 'escape-html';
import { formatAge, getStaleLevel } from './utils.js';
import { APPROVAL_STATUSES, collectReviewQueue, getReviewQueueOrgs, getPullRequestNumber } from './review-queue.js';

const STATUS_ORDER = Object.keys(APPROVAL_STATUSES);
const DESKTOP_ONLY_CELL = 'd-none d-md-table-cell';
export const REVIEW_QUEUE_PATH = '/reviews/';

function getStatus(approvalStatus) {
    return APPROVAL_STATUSES[approvalStatus] || APPROVAL_STATUSES.unknown;
}

function formatOpenDays(days) {
    if (days === null) return '-';
    if (days < 1) return 'today';
    return `${days}d`;
}

function describeSize(pr) {
    const lines = `${pr.additions} lines added, ${pr.deletions} removed`;
    if (pr.changedFiles === null || pr.changedFiles === undefined) return lines;
    return `${lines} in ${pr.changedFiles} ${pr.changedFiles === 1 ? 'file' : 'files'}`;
}

function generateSizeCell(pr) {
    if (pr.size === null || pr.size === undefined) {
        return '<td class="queue-num text-muted" data-sort="-1">-</td>';
    }
    return `
          <td class="queue-num" data-sort="${pr.additions + pr.deletions}" title="${describeSize(pr)}">
            <span class="size-badge size-${pr.size.toLowerCase()}">${pr.size}</span>
            <span class="queue-size-detail d-none d-md-inline"><span class="text-success">+${pr.additions}</span> <span class="text-danger">-${pr.deletions}</span></span>
          </td>`;
}

function generateUpdatedCell(pr, config) {
    const staleLevel = getStaleLevel(pr.updatedAt, config.staleThresholds);
    if (staleLevel === 'ok') {
        return `<td class="queue-num queue-updated" data-sort="${pr.ageDays ?? -1}">${formatAge(pr.updatedAt)}</td>`;
    }
    const threshold = staleLevel === 'critical' ? config.staleThresholds.criticalDays : config.staleThresholds.warningDays;
    return `<td class="queue-num queue-updated queue-stale-${staleLevel}" data-sort="${pr.ageDays ?? -1}" title="No update for more than ${threshold} days">${formatAge(pr.updatedAt)}<span class="visually-hidden"> (stale)</span></td>`;
}

function generateMeta(pr) {
    const number = getPullRequestNumber(pr.url);
    return [number ? `#${number}` : '', pr.author ? `by ${escapeHtml(pr.author)}` : '']
        .filter(part => part !== '')
        .join(' · ');
}

function generateRow(pr, config) {
    const status = getStatus(pr.approvalStatus);
    const comments = pr.commentCount ?? null;
    return `
        <tr data-status="${escapeHtml(pr.approvalStatus)}">
          <td class="queue-repo ${DESKTOP_ONLY_CELL}"><a href="${escapeHtml(pr.repoUrl)}" class="text-decoration-none" target="_blank" rel="noopener" title="${escapeHtml(pr.repo)}">${escapeHtml(pr.repo)}</a></td>
          <td class="queue-title">
            <span class="queue-repo-inline d-md-none">${escapeHtml(pr.repo)}</span>
            <a href="${escapeHtml(pr.url)}" class="text-decoration-none queue-title-link" target="_blank" rel="noopener">${escapeHtml(pr.title)}</a>
            <span class="queue-meta">${generateMeta(pr)}</span>
          </td>
          <td class="queue-num ${DESKTOP_ONLY_CELL}" data-sort="${pr.openDays ?? -1}">${formatOpenDays(pr.openDays)}</td>
          ${generateUpdatedCell(pr, config)}
          <td class="queue-num ${DESKTOP_ONLY_CELL}" data-sort="${comments ?? -1}">${comments ?? '-'}</td>
          ${generateSizeCell(pr)}
          <td class="queue-num" data-sort="${STATUS_ORDER.indexOf(pr.approvalStatus)}"><span class="review-badge ${status.badgeClass}" title="${escapeHtml(status.description)}">${status.label}</span></td>
        </tr>`;
}

function generateFilterButton(status, count) {
    const { label, badgeClass, description } = APPROVAL_STATUSES[status];
    return `<button type="button" class="btn btn-sm queue-filter" data-status="${status}" aria-pressed="false" title="${escapeHtml(description)}"><span class="status-dot ${badgeClass}" aria-hidden="true"></span>${label} <span class="queue-filter-count">${count}</span></button>`;
}

function generateToolbar(counts, total) {
    const buttons = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => generateFilterButton(status, count))
        .join('\n              ');
    return `
          <div class="queue-toolbar">
            <div class="queue-filters" role="group" aria-label="Filter by approval status">
              <span class="queue-toolbar-label">Filter by approval:</span>
              ${buttons}
              <button type="button" class="btn btn-link btn-sm queue-clear" hidden>Show all</button>
            </div>
            <div class="queue-search-row">
              <input type="search" id="queueSearch" class="form-control form-control-sm" placeholder="Search by title, repository, author or #number" aria-label="Search pull requests">
              <span id="queueShown" class="queue-shown" aria-live="polite">Showing all ${total}</span>
            </div>
          </div>`;
}

function generateTable(items, config) {
    return `
          <div class="table-responsive">
            <table class="table table-hover sortable review-queue-table">
              <thead>
                <tr>
                  <th class="${DESKTOP_ONLY_CELL}">Repository</th>
                  <th class="queue-title-header">Pull request</th>
                  <th class="${DESKTOP_ONLY_CELL}" title="Days since the PR was opened">Open</th>
                  <th title="Time since the last update">Updated</th>
                  <th class="${DESKTOP_ONLY_CELL}" title="Comments plus inline review threads">Comments</th>
                  <th title="Lines added and removed">Size</th>
                  <th title="Approval status as required by branch protection">Approval</th>
                </tr>
              </thead>
              <tbody>${items.map(pr => generateRow(pr, config)).join('')}</tbody>
            </table>
          </div>
          <div class="queue-empty alert alert-light" hidden>
            No pull requests match these filters.
            <button type="button" class="btn btn-link btn-sm p-0 align-baseline queue-clear">Show all</button>
          </div>`;
}

export function generateReviewQueueSection(dashboardData, config) {
    const orgNames = getReviewQueueOrgs(config, Object.keys(dashboardData.organizations));
    const { items, counts } = collectReviewQueue(dashboardData.organizations, orgNames);

    const body = items.length === 0
        ? '<div class="alert alert-success">No open pull requests.</div>'
        : generateToolbar(counts, items.length) + generateTable(items, config);

    return `
      <section class="mb-5" id="section-review-queue">
        <h2 class="display-6 mb-3">PR Review Queue</h2>
        <div class="queue-callout" role="note">
          <p class="mb-1"><strong>These pull requests will go into a future release of Mage-OS.</strong> Every one of them needs as many eyes as possible before it ships.</p>
          <p class="mb-0">Any review is appreciated: read the code, test it locally, or leave a comment with questions or findings. An approval from the distribution team is required to merge, but every review helps them get there faster. If you want to help Mage-OS, this is the best place to start.</p>
        </div>
        <p class="text-muted small">Most recently updated first. Click a column header to re-sort.</p>
        ${body}
      </section>
    `;
}

function generateTeaserStatusLink(status, count) {
    const { label, badgeClass, description } = APPROVAL_STATUSES[status];
    return `<a class="review-badge ${badgeClass} queue-teaser-status" href="${REVIEW_QUEUE_PATH}?status=${status}" title="${escapeHtml(description)}">${label}: <strong>${count}</strong></a>`;
}

const GITHUB_URL = 'https://github.com';

function generateOrganizationLinks(orgNames) {
    const links = orgNames.map(orgName => `<a href="${GITHUB_URL}/${escapeHtml(orgName)}" target="_blank" rel="noopener">${escapeHtml(orgName)}</a>`);
    const list = links.length > 1 ? `${links.slice(0, -1).join(', ')} and ${links.at(-1)}` : links[0];
    return `the ${list} ${links.length > 1 ? 'organizations' : 'organization'}`;
}

function describeQueue(total, needingApproval, orgNames) {
    const openPullRequests = `${total} open pull ${total === 1 ? 'request' : 'requests'}`;
    const waiting = needingApproval === 0 ? 'none' : needingApproval;
    return `${openPullRequests}, ${waiting} waiting for approval in ${generateOrganizationLinks(orgNames)}.`;
}

export function generateReviewQueueTeaser(dashboardData, config) {
    const orgNames = getReviewQueueOrgs(config, Object.keys(dashboardData.organizations));
    const { items, counts } = collectReviewQueue(dashboardData.organizations, orgNames);
    const statusLinks = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => generateTeaserStatusLink(status, count))
        .join(' ');

    return `
      <section class="mb-5 queue-teaser">
        <div class="card">
          <div class="card-body queue-teaser-body">
            <div class="queue-teaser-intro">
              <h2 class="h4 mb-1">PR Review Queue</h2>
              <p class="mb-0 small text-muted">${describeQueue(items.length, counts.review_required, orgNames)} Reviewing one is the best way to help Mage-OS.</p>
            </div>
            <a class="btn btn-primary queue-teaser-action" href="${REVIEW_QUEUE_PATH}">Open review queue</a>
            <div class="queue-teaser-statuses">${statusLinks}</div>
          </div>
        </div>
      </section>
    `;
}

export function generateReviewQueueStyles() {
    return `
          .queue-toolbar {
            max-width: 1400px;
            margin-bottom: 0.75rem;
          }
          .queue-filters {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.375rem;
            margin-bottom: 0.5rem;
          }
          .queue-toolbar-label {
            font-size: 0.875rem;
            font-weight: 600;
            margin-right: 0.25rem;
          }
          .queue-filter {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            background-color: #fff;
            border: 1px solid #adb5bd;
            border-radius: 2rem;
            color: #212529;
          }
          .queue-filter:hover {
            background-color: #f1f3f5;
            border-color: #6c757d;
            color: #212529;
          }
          .queue-filter[aria-pressed="true"],
          .queue-filter[aria-pressed="true"]:hover {
            background-color: #e7f1ff;
            border-color: #0d6efd;
            box-shadow: inset 0 0 0 1px #0d6efd;
            color: #084298;
          }
          .queue-filter[aria-pressed="true"]::before {
            content: "\\2713";
            font-weight: 700;
          }
          .queue-filter-count {
            background-color: rgba(0, 0, 0, 0.08);
            border-radius: 1rem;
            padding: 0 0.4rem;
            font-size: 0.85em;
            font-weight: 600;
          }
          .status-dot {
            display: inline-block;
            width: 0.65rem;
            height: 0.65rem;
            border-radius: 50%;
            border: 1px solid rgba(0, 0, 0, 0.3);
          }
          .queue-filter:focus-visible,
          .queue-clear:focus-visible,
          #queueSearch:focus-visible {
            outline: 2px solid #0d6efd;
            outline-offset: 2px;
          }
          .queue-search-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.75rem;
          }
          .queue-search-row input {
            max-width: 24rem;
          }
          .queue-shown {
            font-size: 0.875rem;
            color: #495057;
          }
          .queue-shown.is-filtered {
            font-weight: 600;
            color: #084298;
          }
          .queue-empty {
            max-width: 1400px;
          }
          .queue-callout {
            max-width: 1400px;
            margin-bottom: 1rem;
            padding: 0.875rem 1rem;
            border-left: 4px solid #0d6efd;
            border-radius: 0.25rem;
            background-color: #e7f1ff;
            color: #052c65;
          }
          .queue-teaser .card {
            max-width: 1400px;
            height: auto;
            margin-bottom: 0;
          }
          .queue-teaser .queue-teaser-body {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 0.75rem 1.5rem;
            padding: 1.25rem !important;
          }
          .queue-teaser-statuses {
            grid-column: 1 / -1;
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          @media (max-width: 575.98px) {
            .queue-teaser .queue-teaser-body {
              grid-template-columns: 1fr;
            }
            .queue-teaser-action {
              order: 1;
              justify-self: start;
            }
          }
          .queue-teaser-status {
            font-size: 0.85em;
            margin-left: 0;
            text-decoration: none;
          }
          .queue-teaser-status:hover,
          .queue-teaser-status:focus-visible {
            text-decoration: underline;
          }

          .review-queue-table.table {
            table-layout: auto;
            width: 100%;
            max-width: 1400px;
            font-size: 0.9rem;
          }
          .review-queue-table td {
            vertical-align: middle;
          }
          .review-queue-table th,
          .review-queue-table .queue-num,
          .review-queue-table .queue-repo {
            width: 1%;
            white-space: nowrap;
          }
          .review-queue-table th.queue-title-header {
            width: auto;
          }
          .review-queue-table .queue-repo a {
            display: block;
            max-width: 13rem;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .review-queue-table .queue-title {
            min-width: 14rem;
          }
          .queue-title-link {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .queue-repo,
          .queue-repo-inline {
            font-family: monospace;
            font-size: 0.85em;
          }
          .queue-repo-inline {
            display: block;
            color: #495057;
          }
          .queue-meta,
          .queue-size-detail,
          .queue-updated {
            font-size: 0.85em;
            color: #495057;
          }
          .queue-updated.queue-stale-warning {
            color: #8a5a00;
            font-weight: 600;
          }
          .queue-updated.queue-stale-critical {
            color: #b02a37;
            font-weight: 600;
          }
          .review-queue-table .review-badge {
            font-size: 0.8em;
            margin-left: 0;
            white-space: nowrap;
          }
          .size-badge {
            display: inline-block;
            min-width: 1.8rem;
            padding: 0.05rem 0.3rem;
            border-radius: 0.25rem;
            background-color: #e9ecef;
            color: #343a40;
            font-size: 0.8em;
            font-weight: 600;
            text-align: center;
          }
          .size-l,
          .size-xl {
            background-color: #ced4da;
            color: #212529;
          }
    `;
}

export function generateReviewQueueScript() {
    return `
          (function () {
            var section = document.getElementById('section-review-queue');
            var table = section && section.querySelector('.review-queue-table');
            if (!table) return;

            var storageKey = 'reviewQueueSelectedStatuses';
            var filters = section.querySelector('.queue-filters');
            var buttons = section.querySelectorAll('.queue-filter');
            var clearButtons = section.querySelectorAll('.queue-clear');
            var search = document.getElementById('queueSearch');
            var shown = document.getElementById('queueShown');
            var empty = section.querySelector('.queue-empty');
            var rows = table.querySelectorAll('tbody tr');

            function readSelected() {
              try {
                return JSON.parse(localStorage.getItem(storageKey)) || [];
              } catch (error) {
                return [];
              }
            }

            function saveSelected(selected) {
              localStorage.setItem(storageKey, JSON.stringify(selected));
              apply();
            }

            function apply() {
              var selected = readSelected();
              var query = search.value.toLowerCase().trim();
              var isFiltered = selected.length > 0 || query !== '';
              var visible = 0;

              filters.classList.toggle('has-selection', selected.length > 0);
              buttons.forEach(function (button) {
                button.setAttribute('aria-pressed', selected.indexOf(button.dataset.status) !== -1 ? 'true' : 'false');
              });
              rows.forEach(function (row) {
                var matchesStatus = selected.length === 0 || selected.indexOf(row.dataset.status) !== -1;
                var matchesQuery = query === '' || row.textContent.toLowerCase().indexOf(query) !== -1;
                row.hidden = !(matchesStatus && matchesQuery);
                if (!row.hidden) visible++;
              });

              clearButtons.forEach(function (button) { button.hidden = !isFiltered; });
              shown.classList.toggle('is-filtered', isFiltered);
              shown.textContent = isFiltered
                ? 'Filtered: showing ' + visible + ' of ' + rows.length
                : 'Showing all ' + rows.length;
              table.hidden = visible === 0;
              empty.hidden = visible !== 0;
            }

            buttons.forEach(function (button) {
              button.addEventListener('click', function () {
                var selected = readSelected();
                var status = button.dataset.status;
                saveSelected(selected.indexOf(status) === -1
                  ? selected.concat(status)
                  : selected.filter(function (s) { return s !== status; }));
              });
            });

            clearButtons.forEach(function (button) {
              button.addEventListener('click', function () {
                search.value = '';
                saveSelected([]);
              });
            });

            search.addEventListener('input', apply);

            var requestedStatuses = new URLSearchParams(window.location.search).getAll('status');
            if (requestedStatuses.length > 0) {
              saveSelected(requestedStatuses);
              history.replaceState(null, '', window.location.pathname);
              return;
            }
            apply();
          })();
    `;
}
