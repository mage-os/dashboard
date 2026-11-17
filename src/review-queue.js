import { getDaysSince } from './utils.js';

// Approval status as enforced by branch protection (GitHub's `reviewDecision`),
// listed in the order the review queue shows them: work for reviewers first.
export const APPROVAL_STATUSES = {
    review_required: {
        label: 'Needs approval',
        badgeClass: 'review-pending',
        description: 'Branch protection requires an approving review before this PR can be merged'
    },
    approved: {
        label: 'Approved',
        badgeClass: 'review-approved',
        description: 'Approved and ready to merge'
    },
    changes_requested: {
        label: 'Changes requested',
        badgeClass: 'review-changes',
        description: 'A reviewer requested changes; waiting on the author'
    },
    not_required: {
        label: 'No approval required',
        badgeClass: 'review-none',
        description: 'This repository does not require an approving review'
    },
    draft: {
        label: 'Draft',
        badgeClass: 'review-none',
        description: 'Draft PR, not ready for review yet'
    },
    unknown: {
        label: 'Unknown',
        badgeClass: 'review-none',
        description: 'No approval data available for this PR'
    }
};

export function getPullRequestNumber(url) {
    return url?.match(/\/pull\/(\d+)/)?.[1] ?? null;
}

const STATUS_ORDER = Object.keys(APPROVAL_STATUSES);

const REVIEW_DECISIONS = {
    REVIEW_REQUIRED: 'review_required',
    APPROVED: 'approved',
    CHANGES_REQUESTED: 'changes_requested'
};

// Upper bound (inclusive) of changed lines per size label; anything larger is XL.
const SIZE_BUCKETS = [
    { label: 'XS', maxLines: 9 },
    { label: 'S', maxLines: 49 },
    { label: 'M', maxLines: 249 },
    { label: 'L', maxLines: 999 }
];

export function getApprovalStatus(pr) {
    if (pr.isDraft) return 'draft';
    if (!('reviewDecision' in pr)) return 'unknown';
    return REVIEW_DECISIONS[pr.reviewDecision] || 'not_required';
}

export function getPrSizeLabel(additions, deletions) {
    if (additions === null || additions === undefined) return null;
    const lines = additions + (deletions || 0);
    return SIZE_BUCKETS.find(bucket => lines <= bucket.maxLines)?.label || 'XL';
}

// Conversation comments plus inline review threads; null when the snapshot
// predates comment tracking.
export function countComments(pr) {
    if (!pr.comments) return null;
    return pr.comments.totalCount + (pr.reviewThreads?.totalCount || 0);
}

function compareQueueItems(a, b) {
    return new Date(b.updatedAt) - new Date(a.updatedAt);
}

/**
 * Flattens the open PRs of the given organizations from the dashboard JSON
 * into one list, most recently updated first.
 */
export function collectReviewQueue(organizations, orgNames, now = Date.now()) {
    const items = orgNames
        .filter(orgName => organizations[orgName])
        .flatMap(orgName => organizations[orgName].repositories.flatMap(repo =>
            repo.pullRequests.map(pr => ({
                ...pr,
                org: orgName,
                repo: repo.name,
                repoUrl: repo.url,
                approvalStatus: pr.approvalStatus || 'unknown',
                openDays: pr.createdAt ? getDaysSince(pr.createdAt, now) : null
            }))
        ))
        .sort(compareQueueItems);

    const counts = Object.fromEntries(STATUS_ORDER.map(status => [
        status,
        items.filter(item => item.approvalStatus === status).length
    ]));

    return { items, counts };
}

export function getReviewQueueOrgs(config, availableOrgs) {
    return config.reviewQueue?.organizations || availableOrgs;
}
