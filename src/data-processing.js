import { getDaysSince, getStaleLevel, getReviewStatus } from './utils.js';

export function computeStats(orgDataMap, thresholds) {
    let totalRepos = 0;
    let totalIssues = 0;
    let totalPRs = 0;
    let stalePRs = 0;
    let staleIssues = 0;
    let reposWithAlerts = 0;

    for (const data of Object.values(orgDataMap)) {
        const repos = data.data.organization.repositories.nodes;
        totalRepos += repos.length;
        for (const repo of repos) {
            totalIssues += repo.issues.totalCount;
            totalPRs += repo.pullRequests.totalCount;

            for (const issue of repo.issues.nodes) {
                if (getDaysSince(issue.updatedAt) >= thresholds.criticalDays) staleIssues++;
            }
            for (const pr of repo.pullRequests.nodes) {
                if (getDaysSince(pr.updatedAt) >= thresholds.warningDays) stalePRs++;
            }

            const alertCount = repo.vulnerabilityAlerts?.totalCount || 0;
            if (alertCount > 0) reposWithAlerts++;
        }
    }

    return { totalRepos, totalIssues, totalPRs, stalePRs, staleIssues, reposWithAlerts };
}

export function computePriorityScore(item, type, repo, config) {
    const weights = config.priorityWeights || {
        age: 25, security: 25, reviewStatus: 20, labels: 15, repoActivity: 15
    };
    const factors = { age: 0, security: 0, reviewStatus: 0, labels: 0, repoActivity: 0 };

    const ageDays = getDaysSince(item.updatedAt);
    factors.age = Math.min(weights.age, Math.round((ageDays / 90) * weights.age));

    const alertCount = repo.vulnerabilityAlerts?.totalCount || 0;
    if (alertCount > 0) {
        factors.security = type === 'pr' ? weights.security : Math.round(weights.security * 0.6);
    }

    if (type === 'pr') {
        const reviewStatus = getReviewStatus(item);
        const reviewScores = {
            approved: 1.0,
            changes_requested: 0.75,
            review_requested: 0.5,
            commented: 0.4,
            none: 0.25
        };
        factors.reviewStatus = Math.round((reviewScores[reviewStatus] || 0) * weights.reviewStatus);
    }

    const labelNames = (item.labels?.nodes || []).map(l => l.name.toLowerCase());
    if (labelNames.some(l => ['bug', 'security', 'critical', 'urgent', 'hotfix'].includes(l))) {
        factors.labels = weights.labels;
    } else if (labelNames.some(l => ['enhancement', 'feature'].includes(l))) {
        factors.labels = Math.round(weights.labels * 0.67);
    } else if (labelNames.some(l => ['documentation', 'docs', 'chore'].includes(l))) {
        factors.labels = Math.round(weights.labels * 0.33);
    }

    const lastCommitDate = repo.defaultBranchRef?.target?.committedDate;
    if (lastCommitDate && ageDays > config.staleThresholds.warningDays) {
        const repoAgeDays = getDaysSince(lastCommitDate);
        if (repoAgeDays < 30) {
            factors.repoActivity = weights.repoActivity;
        } else if (repoAgeDays < 90) {
            factors.repoActivity = Math.round(weights.repoActivity * 0.5);
        }
    }

    const score = Object.values(factors).reduce((sum, v) => sum + v, 0);
    return { score, factors };
}

export function collectDashboardData(orgDataMap, reposWithRunsMap, missingMirrors, config) {
    const stats = computeStats(orgDataMap, config.staleThresholds);
    const allItems = [];

    const organizations = {};
    for (const [orgName, data] of Object.entries(orgDataMap)) {
        const repos = data.data.organization.repositories.nodes;
        organizations[orgName] = {
            repositories: repos.map(repo => {
                const workflowInfo = reposWithRunsMap[`${orgName}/${repo.name}`];
                const alertCount = repo.vulnerabilityAlerts?.totalCount ?? 0;
                const lastCommitDate = repo.defaultBranchRef?.target?.committedDate || null;

                const issues = repo.issues.nodes.map(issue => {
                    const ageDays = getDaysSince(issue.updatedAt);
                    const priority = computePriorityScore(issue, 'issue', repo, config);
                    const item = {
                        title: issue.title,
                        url: issue.url,
                        createdAt: issue.createdAt,
                        updatedAt: issue.updatedAt,
                        ageDays,
                        staleLevel: getStaleLevel(issue.updatedAt, config.staleThresholds),
                        labels: (issue.labels?.nodes || []).map(l => ({ name: l.name, color: l.color })),
                        priorityScore: priority.score,
                        priorityFactors: priority.factors
                    };
                    allItems.push({ ...item, type: 'issue', repo: repo.name, org: orgName });
                    return item;
                });

                const pullRequests = repo.pullRequests.nodes.map(pr => {
                    const ageDays = getDaysSince(pr.updatedAt);
                    const priority = computePriorityScore(pr, 'pr', repo, config);
                    const item = {
                        title: pr.title,
                        url: pr.url,
                        createdAt: pr.createdAt,
                        updatedAt: pr.updatedAt,
                        ageDays,
                        staleLevel: getStaleLevel(pr.updatedAt, config.staleThresholds),
                        author: pr.author?.login || null,
                        reviewStatus: getReviewStatus(pr),
                        priorityScore: priority.score,
                        priorityFactors: priority.factors
                    };
                    allItems.push({ ...item, type: 'pr', repo: repo.name, org: orgName });
                    return item;
                });

                return {
                    name: repo.name,
                    url: repo.url,
                    lastCommitDate,
                    securityAlertCount: alertCount,
                    lastWorkflowRun: workflowInfo
                        ? { date: workflowInfo.date, conclusion: workflowInfo.conclusion }
                        : null,
                    issues,
                    pullRequests
                };
            })
        };
    }

    allItems.sort((a, b) => b.priorityScore - a.priorityScore);
    const actionItems = allItems.slice(0, 20);

    return {
        generatedAt: new Date().toISOString(),
        stats,
        organizations,
        missingMirrors: missingMirrors.map(repo => ({
            name: repo.name,
            url: repo.html_url,
            lastUpdated: repo.updated_at
        })),
        actionItems
    };
}

export async function collectWorkflowRuns(orgDataMap, fetchWorkflowRunsFn) {
    const runsMap = {};
    const reposWithRuns = [];

    for (const [orgName, orgData] of Object.entries(orgDataMap)) {
        const repos = orgData.data.organization.repositories.nodes
            .filter(repo => !repo.isArchived)
            .sort((a, b) => a.name.localeCompare(b.name));

        const results = await Promise.all(
            repos.map(async (repo) => {
                try {
                    const runsData = await fetchWorkflowRunsFn(orgName, repo.name);
                    const lastRun = runsData.workflow_runs?.[0];
                    const info = {
                        date: lastRun ? new Date(lastRun.created_at).toISOString() : null,
                        conclusion: lastRun?.conclusion || lastRun?.status || null
                    };
                    runsMap[`${orgName}/${repo.name}`] = info;
                    return { ...repo, lastRunDate: lastRun ? new Date(lastRun.created_at) : null, lastRunConclusion: info.conclusion };
                } catch (error) {
                    console.error(`Error fetching workflow runs for ${orgName}/${repo.name}:`, error);
                    runsMap[`${orgName}/${repo.name}`] = { date: null, conclusion: null };
                    return { ...repo, lastRunDate: null, lastRunConclusion: null };
                }
            })
        );
        reposWithRuns.push(...results);
    }

    return { runsMap, reposWithRuns };
}

export async function collectMissingMirrors(orgDataMap, fetchMagentoReposFn, ignoreList = []) {
    const magentoRepos = await fetchMagentoReposFn();

    const mirroredRepoNames = new Set();
    for (const orgData of Object.values(orgDataMap)) {
        const repos = orgData.data.organization.repositories.nodes;
        for (const repo of repos) {
            if (repo.name.startsWith('mirror-')) {
                mirroredRepoNames.add(repo.name.substring(7));
            }
        }
    }

    const ignoredRepos = new Set(ignoreList);
    return magentoRepos
        .filter(repo => !mirroredRepoNames.has(repo.name) && !ignoredRepos.has(repo.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}
