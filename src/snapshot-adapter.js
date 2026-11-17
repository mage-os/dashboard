// Converts an archived dashboard-data.json snapshot back into the raw
// structures the HTML generators consume, so the dashboard can be rebuilt
// without GitHub API access.

const REVIEW_STATES = {
    approved: 'APPROVED',
    changes_requested: 'CHANGES_REQUESTED',
    commented: 'COMMENTED'
};

function toReviewFields(reviewStatus) {
    if (REVIEW_STATES[reviewStatus]) {
        return {
            reviews: { nodes: [{ state: REVIEW_STATES[reviewStatus] }] },
            reviewRequests: { totalCount: 0 }
        };
    }
    return {
        reviews: { nodes: [] },
        reviewRequests: { totalCount: reviewStatus === 'review_requested' ? 1 : 0 }
    };
}

function toDefaultBranchRef(lastCommitDate) {
    return lastCommitDate ? { target: { committedDate: lastCommitDate } } : null;
}

function toRepoNode(repo) {
    return {
        name: repo.name,
        url: repo.url,
        isArchived: false,
        defaultBranchRef: toDefaultBranchRef(repo.lastCommitDate),
        issues: {
            totalCount: repo.issues.length,
            nodes: repo.issues.map(issue => ({
                title: issue.title,
                url: issue.url,
                createdAt: issue.createdAt,
                updatedAt: issue.updatedAt,
                labels: { nodes: issue.labels }
            }))
        },
        pullRequests: {
            totalCount: repo.pullRequests.length,
            nodes: repo.pullRequests.map(pr => ({
                title: pr.title,
                url: pr.url,
                createdAt: pr.createdAt,
                updatedAt: pr.updatedAt,
                author: pr.author === null ? null : { login: pr.author },
                ...toReviewFields(pr.reviewStatus)
            }))
        }
    };
}

export function toOrgDataMap(snapshot) {
    return Object.fromEntries(
        Object.entries(snapshot.organizations).map(([orgName, org]) => [
            orgName,
            {
                data: {
                    organization: {
                        repositories: {
                            nodes: org.repositories.map(toRepoNode)
                        }
                    }
                }
            }
        ])
    );
}

export function toReposWithRuns(snapshot) {
    return Object.values(snapshot.organizations).flatMap(org =>
        [...org.repositories]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(repo => ({
                name: repo.name,
                url: repo.url,
                defaultBranchRef: toDefaultBranchRef(repo.lastCommitDate),
                lastRunDate: repo.lastWorkflowRun?.date ? new Date(repo.lastWorkflowRun.date) : null,
                lastRunConclusion: repo.lastWorkflowRun?.conclusion ?? null
            }))
    );
}

export function toMissingMirrors(snapshot) {
    return snapshot.missingMirrors.map(repo => ({
        name: repo.name,
        html_url: repo.url,
        updated_at: repo.lastUpdated
    }));
}
