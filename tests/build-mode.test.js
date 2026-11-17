import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { isPreviewBuild } from '../src/build-mode.js';
import { generateSiteFiles, writeSiteFiles } from '../src/site-output.js';
import { loadSnapshot, renderIndexFromSnapshot } from '../src/snapshot-build.js';

const config = { staleThresholds: { warningDays: 30, criticalDays: 90 }, reviewQueue: { organizations: ['mage-os'] } };

function makeSnapshot() {
    return {
        generatedAt: '2026-11-17T15:40:18.455Z',
        stats: { totalRepos: 1, totalIssues: 0, totalPRs: 1, stalePRs: 0, staleIssues: 0 },
        organizations: {
            'mage-os': {
                repositories: [{
                    name: 'mageos-magento2',
                    url: 'https://github.com/mage-os/mageos-magento2',
                    lastCommitDate: '2026-11-10T00:00:00Z',
                    lastWorkflowRun: { date: '2026-11-10T00:00:00Z', conclusion: 'success' },
                    issues: [],
                    pullRequests: [{
                        title: 'Snapshot PR',
                        url: 'https://github.com/mage-os/mageos-magento2/pull/7',
                        createdAt: '2026-11-01T00:00:00Z',
                        updatedAt: '2026-11-15T00:00:00Z',
                        ageDays: 2,
                        author: 'someone',
                        reviewStatus: 'none',
                        approvalStatus: 'review_required'
                    }]
                }]
            }
        },
        missingMirrors: [],
        actionItems: []
    };
}

describe('isPreviewBuild', () => {
    test.each([
        ['a Cloudflare build of a feature branch', { CF_PAGES: '1', CF_PAGES_BRANCH: 'add-pr-review-queue' }, true],
        ['a Cloudflare build of the production branch', { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, false],
        ['a Cloudflare build without branch information', { CF_PAGES: '1' }, false],
        ['a GitHub Actions build', { GITHUB_ACTIONS: 'true', CF_PAGES_BRANCH: 'feature' }, false],
        ['a local build', {}, false]
    ])('%s is a preview build: %s', (_, env, expected) => {
        expect(isPreviewBuild(env)).toBe(expected);
    });
});

describe('generateSiteFiles', () => {
    const files = generateSiteFiles('<html>index</html>', makeSnapshot(), config);

    test('includes both pages and every agent-facing file', () => {
        expect(Object.keys(files).sort()).toEqual([
            '_headers', 'dashboard-data.json', 'index.html', 'index.md', 'llms.txt', 'report.md', 'reviews/index.html'
        ]);
    });

    test('renders the review queue page from the dashboard data', () => {
        expect(files['index.html']).toBe('<html>index</html>');
        expect(files['reviews/index.html']).toContain('Snapshot PR');
    });
});

describe('writeSiteFiles', () => {
    test('writes files into nested directories', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'dashboard-site-'));

        await writeSiteFiles({ 'index.html': 'home', 'reviews/index.html': 'queue' }, directory);

        expect(await readFile(join(directory, 'reviews/index.html'), 'utf-8')).toBe('queue');
        expect(await readFile(join(directory, 'index.html'), 'utf-8')).toBe('home');
        await rm(directory, { recursive: true });
    });
});

describe('snapshot build', () => {
    test('loads a snapshot from a local file', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'dashboard-snapshot-'));
        const path = join(directory, 'snapshot.json');
        await writeFile(path, JSON.stringify(makeSnapshot()));

        const snapshot = await loadSnapshot(path);

        expect(snapshot.generatedAt).toBe('2026-11-17T15:40:18.455Z');
        await rm(directory, { recursive: true });
    });

    test('renders the overview page from a snapshot', () => {
        const html = renderIndexFromSnapshot(makeSnapshot(), config);

        expect(html).toContain('mageos-magento2');
        expect(html).toContain('1 open pull request, 1 waiting for approval');
        expect(html).toContain('href="/reviews/"');
    });
});
