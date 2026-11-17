import {
    getApprovalStatus,
    getPrSizeLabel,
    countComments,
    collectReviewQueue,
    getReviewQueueOrgs
} from '../src/review-queue.js';
import { generateReviewQueueSection, generateReviewQueueTeaser, generateSourceLink, generateNav, generateHTML, generateReviewQueuePage } from '../src/html-generators.js';
import { generateMarkdownDashboard } from '../src/agent-docs.js';

const NOW = new Date('2026-11-16T12:00:00Z').getTime();
const config = { staleThresholds: { warningDays: 30, criticalDays: 90 }, reviewQueue: { organizations: ['mage-os'] } };

function makePr(overrides = {}) {
    return {
        title: 'Some PR',
        url: 'https://github.com/mage-os/repo/pull/1',
        createdAt: '2026-11-01T12:00:00Z',
        updatedAt: '2026-11-10T12:00:00Z',
        ageDays: 6,
        author: 'someone',
        isDraft: false,
        approvalStatus: 'review_required',
        additions: 10,
        deletions: 5,
        changedFiles: 2,
        size: 'S',
        commentCount: 3,
        ...overrides
    };
}

function makeOrganizations() {
    return {
        'mage-os': {
            repositories: [
                {
                    name: 'repo-a',
                    url: 'https://github.com/mage-os/repo-a',
                    issues: [],
                    pullRequests: [
                        makePr({ title: 'Approved newer', approvalStatus: 'approved', createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z' }),
                        makePr({ title: 'Needs approval newer', createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z' })
                    ]
                },
                {
                    name: 'repo-b',
                    url: 'https://github.com/mage-os/repo-b',
                    issues: [],
                    pullRequests: [
                        makePr({ title: 'Draft', approvalStatus: 'draft', isDraft: true, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-02-01T00:00:00Z' }),
                        makePr({ title: 'Needs approval oldest', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' })
                    ]
                }
            ]
        },
        'mage-os-lab': {
            repositories: [
                { name: 'lab', url: 'https://github.com/mage-os-lab/lab', issues: [], pullRequests: [makePr({ title: 'Lab PR' })] }
            ]
        }
    };
}

describe('getApprovalStatus', () => {
    test.each([
        ['REVIEW_REQUIRED', 'review_required'],
        ['APPROVED', 'approved'],
        ['CHANGES_REQUESTED', 'changes_requested'],
        [null, 'not_required']
    ])('maps reviewDecision %s to %s', (reviewDecision, expected) => {
        expect(getApprovalStatus({ isDraft: false, reviewDecision })).toBe(expected);
    });

    test('drafts are reported as draft regardless of review decision', () => {
        expect(getApprovalStatus({ isDraft: true, reviewDecision: 'APPROVED' })).toBe('draft');
    });

    test('returns unknown when review decision was not fetched', () => {
        expect(getApprovalStatus({})).toBe('unknown');
    });
});

describe('getPrSizeLabel', () => {
    test.each([
        [0, 0, 'XS'], [5, 4, 'XS'], [5, 5, 'S'], [40, 9, 'S'], [200, 49, 'M'],
        [500, 499, 'L'], [999, 1, 'XL']
    ])('%i additions and %i deletions is %s', (additions, deletions, expected) => {
        expect(getPrSizeLabel(additions, deletions)).toBe(expected);
    });

    test('returns null when size data is missing', () => {
        expect(getPrSizeLabel(undefined, undefined)).toBeNull();
    });
});

describe('countComments', () => {
    test('adds comments and review threads', () => {
        expect(countComments({ comments: { totalCount: 3 }, reviewThreads: { totalCount: 2 } })).toBe(5);
    });

    test('returns null when comments were not fetched', () => {
        expect(countComments({})).toBeNull();
    });
});

describe('collectReviewQueue', () => {
    const { items, counts } = collectReviewQueue(makeOrganizations(), ['mage-os'], NOW);

    test('only includes the configured organizations', () => {
        expect(items.map(item => item.title)).not.toContain('Lab PR');
        expect(items).toHaveLength(4);
    });

    test('orders by last update, newest first', () => {
        expect(items.map(item => item.title)).toEqual([
            'Needs approval newer',
            'Approved newer',
            'Needs approval oldest',
            'Draft'
        ]);
    });

    test('adds repository and days since opening', () => {
        expect(items[2]).toMatchObject({ org: 'mage-os', repo: 'repo-b', repoUrl: 'https://github.com/mage-os/repo-b', openDays: 46 });
    });

    test('counts PRs per approval status', () => {
        expect(counts).toMatchObject({ review_required: 2, approved: 1, draft: 1, changes_requested: 0 });
    });

    test('treats PRs without approval data as unknown', () => {
        const organizations = { 'mage-os': { repositories: [{ name: 'r', url: 'u', pullRequests: [{ title: 'Old', createdAt: '2026-01-01T00:00:00Z' }] }] } };
        expect(collectReviewQueue(organizations, ['mage-os'], NOW).items[0].approvalStatus).toBe('unknown');
    });
});

describe('getReviewQueueOrgs', () => {
    test('uses configured organizations', () => {
        expect(getReviewQueueOrgs(config, ['mage-os', 'mage-os-lab'])).toEqual(['mage-os']);
    });

    test('falls back to all organizations', () => {
        expect(getReviewQueueOrgs({}, ['mage-os', 'mage-os-lab'])).toEqual(['mage-os', 'mage-os-lab']);
    });
});

describe('generateReviewQueueSection', () => {
    const html = generateReviewQueueSection({ organizations: makeOrganizations() }, config);

    test('renders a sortable row per PR with size, comments and approval', () => {
        expect(html).toContain('review-queue-table');
        expect((html.match(/<tr data-status="/g) || [])).toHaveLength(4);
        expect(html).toContain('size-s');
        expect(html).toContain('+10');
        expect(html).toContain('title="10 lines added, 5 removed in 2 files"');
        expect(html).toContain('Needs approval');
        expect(html).toContain('data-sort="15"');
    });

    test('renders a labelled filter button with count per status present', () => {
        expect(html).toContain('Filter by approval:');
        expect(html).toContain('class="btn btn-sm queue-filter" data-status="review_required" aria-pressed="false"');
        expect(html).toContain('Needs approval <span class="queue-filter-count">2</span>');
        expect(html).not.toContain('data-status="changes_requested" aria-pressed');
        expect(html).toContain('class="btn btn-link btn-sm queue-clear" hidden');
    });

    test('has its own search box, a live result count and an empty state', () => {
        expect(html).toContain('id="queueSearch"');
        expect(html).toContain('aria-live="polite">Showing all 4</span>');
        expect(html).toContain('No pull requests match these filters.');
    });

    test('shows the PR number and author', () => {
        expect(html).toContain('#1 · by someone');
    });

    test('marks stale PRs on the updated cell instead of the whole row', () => {
        const organizations = { 'mage-os': { repositories: [{ name: 'r', url: 'u', pullRequests: [makePr({ updatedAt: '2025-01-01T00:00:00Z', ageDays: 500 })] }] } };
        const output = generateReviewQueueSection({ organizations }, config);
        expect(output).toContain('queue-stale-critical');
        expect(output).toContain('title="No update for more than 90 days"');
        expect(output).not.toContain('<tr class="stale-critical"');
    });

    test('hides secondary columns on small screens', () => {
        expect((html.match(/<th class="d-none d-md-table-cell"/g) || [])).toHaveLength(3);
    });

    test('escapes PR titles', () => {
        const organizations = { 'mage-os': { repositories: [{ name: 'r', url: 'u', pullRequests: [makePr({ title: '<script>x</script>' })] }] } };
        const output = generateReviewQueueSection({ organizations }, config);
        expect(output).not.toContain('<script>x');
        expect(output).toContain('&lt;script&gt;');
    });

    test('shows dashes for snapshots without size or comment data', () => {
        const organizations = { 'mage-os': { repositories: [{ name: 'r', url: 'u', pullRequests: [{ title: 'Old', url: 'x', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] }] } };
        const output = generateReviewQueueSection({ organizations }, config);
        expect(output).toContain('Unknown');
        expect(output).toContain('<td class="queue-num text-muted" data-sort="-1">-</td>');
    });

    test('shows a message when there are no open PRs', () => {
        expect(generateReviewQueueSection({ organizations: {} }, config)).toContain('No open pull requests.');
    });
});

describe('generateReviewQueueTeaser', () => {
    const html = generateReviewQueueTeaser({ organizations: makeOrganizations() }, config);

    test('summarises the queue and links to the review queue page', () => {
        expect(html).toContain('4 open pull requests, 2 waiting for approval in the <a href="https://github.com/mage-os" target="_blank" rel="noopener">mage-os</a> organization. Reviewing one is the best way to help Mage-OS.');
        expect(html).toContain('href="/reviews/">Open review queue</a>');
    });

    test('says so when nothing is waiting for approval', () => {
        const organizations = { 'mage-os': { repositories: [{ name: 'r', url: 'u', pullRequests: [makePr({ approvalStatus: 'approved' })] }] } };
        expect(generateReviewQueueTeaser({ organizations }, config)).toContain('1 open pull request, none waiting for approval in the');
    });

    test('links every organization when the queue covers several', () => {
        const html = generateReviewQueueTeaser({ organizations: makeOrganizations() }, { ...config, reviewQueue: { organizations: ['mage-os', 'mage-os-lab'] } });
        expect(html).toContain('>mage-os</a> and <a href="https://github.com/mage-os-lab" target="_blank" rel="noopener">mage-os-lab</a> organizations.');
    });

    test('links each status count to the queue filtered on that status', () => {
        expect(html).toContain('href="/reviews/?status=review_required"');
        expect(html).toContain('Needs approval: <strong>2</strong>');
        expect(html).not.toContain('status=changes_requested');
    });
});

describe('pages and navigation', () => {
    test('marks the active page in the navigation', () => {
        const nav = generateNav('reviews');
        expect(nav).toContain('<a class="nav-link active" href="/reviews/" aria-current="page">PR Review Queue</a>');
        expect(nav).toContain('<a class="nav-link" href="/">Overview</a>');
    });

    test('the overview page shows the teaser instead of the full queue', () => {
        const page = generateHTML('', '', '', '', '', '<section class="queue-teaser">teaser</section>');
        expect(page).toContain('teaser');
        expect(page).toContain('id="dashboardSearch"');
        expect(page).toContain('aria-current="page">Overview');
    });

    test('the review queue page has its own title and no dashboard search', () => {
        const page = generateReviewQueuePage(generateReviewQueueSection({ organizations: makeOrganizations() }, config));
        expect(page).toContain('<title>PR Review Queue · Mage-OS Dashboard</title>');
        expect(page).toContain('review-queue-table');
        expect(page).not.toContain('id="dashboardSearch"');
        expect(page).toContain('aria-current="page">PR Review Queue');
    });
});

describe('generateSourceLink', () => {
    test('links to the dashboard repository', () => {
        expect(generateSourceLink()).toContain('href="https://github.com/mage-os/dashboard"');
    });
});

describe('review queue in the Markdown dashboard', () => {
    const md = generateMarkdownDashboard({
        generatedAt: '2026-11-16T12:00:00Z',
        stats: { totalRepos: 0, totalIssues: 0, totalPRs: 0, stalePRs: 0, staleIssues: 0 },
        organizations: makeOrganizations(),
        missingMirrors: [],
        actionItems: []
    }, config);

    test('lists queued PRs with size and approval status', () => {
        const section = md.split('## PR Review Queue')[1].split('\n## ')[0];
        expect(section).toContain('| mage-os/repo-b | someone |');
        expect(section).toContain('S (+10/-5, 2 files)');
        expect(section).toContain('| Needs approval |');
        expect(section).not.toContain('Lab PR');
    });
});
