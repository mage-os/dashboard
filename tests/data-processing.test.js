import { computeStats, computePriorityScore, collectWorkflowRuns, collectMissingMirrors } from '../src/data-processing.js';

function makeRepo(overrides = {}) {
    return {
        name: 'test-repo',
        url: 'https://github.com/test/test-repo',
        isArchived: false,
        defaultBranchRef: { target: { committedDate: '2025-03-10T12:00:00Z' } },
        issues: { totalCount: 0, nodes: [] },
        pullRequests: { totalCount: 0, nodes: [] },
        ...overrides
    };
}

function makeOrgDataMap(orgs) {
    const map = {};
    for (const [orgName, repos] of Object.entries(orgs)) {
        map[orgName] = {
            data: {
                organization: {
                    repositories: { nodes: repos }
                }
            }
        };
    }
    return map;
}

describe('computeStats', () => {
    const thresholds = { warningDays: 30, criticalDays: 90 };

    test('counts repos, issues, and PRs across orgs', () => {
        const orgDataMap = makeOrgDataMap({
            'org-a': [
                makeRepo({ issues: { totalCount: 3, nodes: [] }, pullRequests: { totalCount: 1, nodes: [] } }),
                makeRepo({ issues: { totalCount: 2, nodes: [] }, pullRequests: { totalCount: 0, nodes: [] } }),
            ],
            'org-b': [
                makeRepo({ issues: { totalCount: 1, nodes: [] }, pullRequests: { totalCount: 2, nodes: [] } }),
            ]
        });

        const stats = computeStats(orgDataMap, thresholds);
        expect(stats.totalRepos).toBe(3);
        expect(stats.totalIssues).toBe(6);
        expect(stats.totalPRs).toBe(3);
    });

    test('counts stale issues and PRs', () => {
        const orgDataMap = makeOrgDataMap({
            'org-a': [makeRepo({
                issues: {
                    totalCount: 2,
                    nodes: [
                        { updatedAt: '2024-01-01T00:00:00Z' },
                        { updatedAt: new Date().toISOString() },
                    ]
                },
                pullRequests: {
                    totalCount: 1,
                    nodes: [
                        { updatedAt: '2024-06-01T00:00:00Z' },
                    ]
                }
            })]
        });

        const stats = computeStats(orgDataMap, thresholds);
        expect(stats.staleIssues).toBe(1);
        expect(stats.stalePRs).toBe(1);
    });
});

describe('computePriorityScore', () => {
    const config = {
        priorityWeights: { age: 30, reviewStatus: 25, labels: 20, repoActivity: 25 },
        staleThresholds: { warningDays: 30, criticalDays: 90 }
    };

    test('age factor scales linearly', () => {
        const repo = makeRepo();
        const recentItem = { updatedAt: new Date().toISOString(), labels: { nodes: [] } };
        const oldItem = { updatedAt: '2024-01-01T00:00:00Z', labels: { nodes: [] } };

        const recentScore = computePriorityScore(recentItem, 'issue', repo, config);
        const oldScore = computePriorityScore(oldItem, 'issue', repo, config);

        expect(recentScore.factors.age).toBe(0);
        expect(oldScore.factors.age).toBe(30);
    });

    test('review status factor for PRs', () => {
        const repo = makeRepo();
        const approvedPR = {
            updatedAt: new Date().toISOString(),
            labels: { nodes: [] },
            reviews: { nodes: [{ state: 'APPROVED' }] },
            reviewRequests: { totalCount: 0 }
        };

        const result = computePriorityScore(approvedPR, 'pr', repo, config);
        expect(result.factors.reviewStatus).toBe(25);
    });

    test('review status factor is 0 for issues', () => {
        const repo = makeRepo();
        const item = { updatedAt: new Date().toISOString(), labels: { nodes: [] } };

        const result = computePriorityScore(item, 'issue', repo, config);
        expect(result.factors.reviewStatus).toBe(0);
    });

    test('bug label gives max label score', () => {
        const repo = makeRepo();
        const item = {
            updatedAt: new Date().toISOString(),
            labels: { nodes: [{ name: 'bug', color: 'ff0000' }] }
        };

        const result = computePriorityScore(item, 'issue', repo, config);
        expect(result.factors.labels).toBe(20);
    });

    test('enhancement label gives partial label score', () => {
        const repo = makeRepo();
        const item = {
            updatedAt: new Date().toISOString(),
            labels: { nodes: [{ name: 'enhancement', color: '00ff00' }] }
        };

        const result = computePriorityScore(item, 'issue', repo, config);
        expect(result.factors.labels).toBe(13);
    });

    test('docs label gives lowest label score', () => {
        const repo = makeRepo();
        const item = {
            updatedAt: new Date().toISOString(),
            labels: { nodes: [{ name: 'documentation', color: '0000ff' }] }
        };

        const result = computePriorityScore(item, 'issue', repo, config);
        expect(result.factors.labels).toBe(7);
    });

    test('score is sum of all factors', () => {
        const repo = makeRepo();
        const item = {
            updatedAt: new Date().toISOString(),
            labels: { nodes: [{ name: 'bug', color: 'ff0000' }] },
            reviews: { nodes: [{ state: 'APPROVED' }] },
            reviewRequests: { totalCount: 0 }
        };

        const result = computePriorityScore(item, 'pr', repo, config);
        const expectedSum = Object.values(result.factors).reduce((s, v) => s + v, 0);
        expect(result.score).toBe(expectedSum);
    });
});

describe('collectWorkflowRuns', () => {
    test('iterates ALL orgs, not just mage-os', async () => {
        const calledWith = [];
        const mockFetch = async (owner, repo) => {
            calledWith.push(`${owner}/${repo}`);
            return { workflow_runs: [] };
        };

        const orgDataMap = makeOrgDataMap({
            'mage-os': [makeRepo({ name: 'repo-a' })],
            'mage-os-lab': [makeRepo({ name: 'repo-b' })]
        });

        await collectWorkflowRuns(orgDataMap, mockFetch);

        expect(calledWith).toContain('mage-os/repo-a');
        expect(calledWith).toContain('mage-os-lab/repo-b');
    });

    test('returns runsMap with org/repo keys', async () => {
        const mockFetch = async () => ({
            workflow_runs: [{ created_at: '2025-03-15T12:00:00Z', conclusion: 'success' }]
        });

        const orgDataMap = makeOrgDataMap({
            'test-org': [makeRepo({ name: 'my-repo' })]
        });

        const { runsMap } = await collectWorkflowRuns(orgDataMap, mockFetch);
        expect(runsMap['test-org/my-repo']).toBeDefined();
        expect(runsMap['test-org/my-repo'].conclusion).toBe('success');
    });

    test('handles fetch errors gracefully per-repo', async () => {
        const mockFetch = async (owner, repo) => {
            if (repo === 'bad-repo') throw new Error('API error');
            return { workflow_runs: [{ created_at: '2025-03-15T12:00:00Z', conclusion: 'success' }] };
        };

        const orgDataMap = makeOrgDataMap({
            'org': [makeRepo({ name: 'good-repo' }), makeRepo({ name: 'bad-repo' })]
        });

        const { runsMap, reposWithRuns } = await collectWorkflowRuns(orgDataMap, mockFetch);
        expect(runsMap['org/good-repo'].conclusion).toBe('success');
        expect(runsMap['org/bad-repo'].conclusion).toBeNull();
        expect(reposWithRuns).toHaveLength(2);
    });

    test('skips archived repos', async () => {
        const calledWith = [];
        const mockFetch = async (owner, repo) => {
            calledWith.push(repo);
            return { workflow_runs: [] };
        };

        const orgDataMap = makeOrgDataMap({
            'org': [
                makeRepo({ name: 'active-repo', isArchived: false }),
                makeRepo({ name: 'archived-repo', isArchived: true })
            ]
        });

        await collectWorkflowRuns(orgDataMap, mockFetch);
        expect(calledWith).toContain('active-repo');
        expect(calledWith).not.toContain('archived-repo');
    });
});

describe('collectMissingMirrors', () => {
    test('finds unmirrored repos', async () => {
        const mockFetchMagento = async () => [
            { name: 'magento2', html_url: 'https://github.com/magento/magento2', updated_at: '2025-03-01' },
            { name: 'inventory', html_url: 'https://github.com/magento/inventory', updated_at: '2025-03-01' },
        ];

        const orgDataMap = makeOrgDataMap({
            'mage-os': [makeRepo({ name: 'mirror-magento2' })]
        });

        const result = await collectMissingMirrors(orgDataMap, mockFetchMagento);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('inventory');
    });

    test('aggregates mirrors from ALL orgs', async () => {
        const mockFetchMagento = async () => [
            { name: 'magento2', html_url: 'https://github.com/magento/magento2', updated_at: '2025-03-01' },
            { name: 'inventory', html_url: 'https://github.com/magento/inventory', updated_at: '2025-03-01' },
        ];

        const orgDataMap = makeOrgDataMap({
            'mage-os': [makeRepo({ name: 'mirror-magento2' })],
            'mage-os-lab': [makeRepo({ name: 'mirror-inventory' })]
        });

        const result = await collectMissingMirrors(orgDataMap, mockFetchMagento);
        expect(result).toHaveLength(0);
    });

    test('respects ignore list', async () => {
        const mockFetchMagento = async () => [
            { name: 'magento2', html_url: 'https://github.com/magento/magento2', updated_at: '2025-03-01' },
            { name: 'devdocs', html_url: 'https://github.com/magento/devdocs', updated_at: '2025-03-01' },
        ];

        const orgDataMap = makeOrgDataMap({ 'mage-os': [] });

        const result = await collectMissingMirrors(orgDataMap, mockFetchMagento, ['devdocs']);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('magento2');
    });

    test('returns sorted results', async () => {
        const mockFetchMagento = async () => [
            { name: 'zebra', html_url: 'x', updated_at: '2025-03-01' },
            { name: 'alpha', html_url: 'x', updated_at: '2025-03-01' },
            { name: 'middle', html_url: 'x', updated_at: '2025-03-01' },
        ];

        const orgDataMap = makeOrgDataMap({ 'org': [] });

        const result = await collectMissingMirrors(orgDataMap, mockFetchMagento);
        expect(result.map(r => r.name)).toEqual(['alpha', 'middle', 'zebra']);
    });
});
