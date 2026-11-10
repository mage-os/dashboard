import { generateMarkdownDashboard, generateLlmsTxt, generateHeadersFile } from '../src/agent-docs.js';
import { generateReport } from '../src/report.js';
import { escapeMarkdown, markdownLink, formatPriorityFactors } from '../src/markdown-utils.js';
import { prefersMarkdown } from '../src/content-negotiation.js';
import { generateAgentHeadLinks, generateAgentNotice } from '../src/html-generators.js';

const config = { staleThresholds: { warningDays: 30, criticalDays: 90 } };

function makeData() {
    return {
        generatedAt: '2026-03-30T21:35:44.884Z',
        stats: { totalRepos: 3, totalIssues: 1, totalPRs: 1, stalePRs: 1, staleIssues: 1 },
        organizations: {
            'mage-os': {
                repositories: [
                    {
                        name: 'zeta',
                        url: 'https://github.com/mage-os/zeta',
                        lastCommitDate: '2026-03-01T00:00:00Z',
                        lastWorkflowRun: { date: '2026-03-02T00:00:00Z', conclusion: 'failure' },
                        issues: [{
                            title: 'Broken | pipe [and] brackets\nnewline',
                            url: 'https://github.com/mage-os/zeta/issues/1',
                            ageDays: 120,
                            staleLevel: 'critical',
                            labels: [{ name: 'bug', color: 'd73a4a' }],
                            priorityScore: 70,
                            priorityFactors: { age: 30, labels: 20, repoActivity: 20, reviewStatus: 0 }
                        }],
                        pullRequests: [{
                            title: 'Fix it',
                            url: 'https://github.com/mage-os/zeta/pull/2',
                            ageDays: 40,
                            staleLevel: 'warning',
                            author: 'some_user',
                            reviewStatus: 'approved',
                            priorityScore: 60,
                            priorityFactors: { age: 13, reviewStatus: 25, labels: 0, repoActivity: 22 }
                        }]
                    },
                    {
                        name: 'alpha',
                        url: 'https://github.com/mage-os/alpha',
                        lastCommitDate: null,
                        lastWorkflowRun: { date: null, conclusion: null },
                        issues: [],
                        pullRequests: []
                    },
                    {
                        name: 'archived',
                        url: 'https://github.com/mage-os/archived',
                        lastCommitDate: null,
                        lastWorkflowRun: null,
                        issues: [],
                        pullRequests: []
                    }
                ]
            }
        },
        missingMirrors: [{ name: 'magento-x', url: 'https://github.com/magento/magento-x', lastUpdated: '2026-01-20T09:12:28Z' }],
        actionItems: [
            {
                type: 'issue', title: 'Broken | pipe [and] brackets\nnewline', url: 'https://github.com/mage-os/zeta/issues/1',
                repo: 'zeta', org: 'mage-os', ageDays: 120, priorityScore: 70,
                priorityFactors: { age: 30, labels: 20, repoActivity: 20, reviewStatus: 0 }
            },
            {
                type: 'pr', title: 'Fix it', url: 'https://github.com/mage-os/zeta/pull/2', repo: 'zeta', org: 'mage-os',
                ageDays: 40, author: 'some_user', reviewStatus: 'approved', priorityScore: 60,
                priorityFactors: { age: 13, reviewStatus: 25, labels: 0, repoActivity: 22 }
            }
        ]
    };
}

function tableRows(md, heading) {
    const section = md.split(`## ${heading}`)[1].split('\n## ')[0];
    return section.split('\n').filter(line => line.startsWith('|'));
}

// Count unescaped pipes, i.e. actual cell delimiters.
function cellCount(row) {
    return (row.match(/(?<!\\)\|/g) || []).length;
}

describe('markdown utils', () => {
    test('escapeMarkdown escapes table and link syntax and flattens newlines', () => {
        expect(escapeMarkdown('a | b [c]\nd_e')).toBe('a \\| b \\[c\\] d\\_e');
        expect(escapeMarkdown(null)).toBe('');
    });

    test('markdownLink encodes characters that would end the link target', () => {
        expect(markdownLink('x', 'https://e.com/a (b)')).toBe('[x](https://e.com/a%20%28b%29)');
    });

    test('formatPriorityFactors skips zero factors and accepts a separator', () => {
        expect(formatPriorityFactors({ age: 30, labels: 0, repoActivity: 5 }, ', ')).toBe('age: 30, repoActivity: 5');
    });
});

describe('generateMarkdownDashboard', () => {
    const md = generateMarkdownDashboard(makeData(), config);

    test('points agents at JSON, llms.txt and the data branch history', () => {
        expect(md).toContain('(/dashboard-data.json)');
        expect(md).toContain('(/llms.txt)');
        expect(md).toContain('https://raw.githubusercontent.com/mage-os/dashboard/data/latest.json');
        expect(md).toContain('https://raw.githubusercontent.com/mage-os/dashboard/data/snapshots/YYYY/MM/YYYY-MM-DD-HH.json');
        expect(md).toContain('https://github.com/mage-os/dashboard/tree/data');
    });

    test('includes summary stats with configured thresholds', () => {
        expect(md).toContain('| Stale PRs (no update >30d) | 1 |');
        expect(md).toContain('| Stale issues (no update >90d) | 1 |');
    });

    test('action item rows keep a consistent column count despite pipes in titles and factors', () => {
        const rows = tableRows(md, 'Top Action Items');
        expect(rows).toHaveLength(4);
        const counts = rows.map(cellCount);
        expect(new Set(counts).size).toBe(1);
        expect(md).toContain('age: 30, labels: 20, repoActivity: 20');
    });

    test('lists issues and PRs per repo, skipping repos with nothing open', () => {
        expect(md).toContain('#### [zeta](https://github.com/mage-os/zeta)');
        expect(md).not.toContain('#### [alpha]');
        expect(md).toContain('stale: critical · labels: bug');
        expect(md).toContain('by some\\_user · updated 40d ago · stale: warning · review: approved');
    });

    test('health table is sorted, labels CI status, and excludes archived repos', () => {
        const rows = tableRows(md, 'Repository Health').slice(2);
        expect(rows[0]).toContain('mage-os/alpha');
        expect(rows[0]).toContain('| - | - | - |');
        expect(rows[1]).toContain('mage-os/zeta');
        expect(rows[1]).toContain('FAILURE');
        expect(md).not.toContain('mage-os/archived');
    });

    test('lists missing mirrors', () => {
        expect(md).toContain('| [magento-x](https://github.com/magento/magento-x) | 2026-01-20 09:12:28 |');
    });

    test('handles empty data', () => {
        const empty = generateMarkdownDashboard({
            ...makeData(), organizations: {}, actionItems: [], missingMirrors: []
        }, config);
        expect(empty).toContain('No action items.');
        expect(empty).toContain('No open issues or pull requests.');
        expect(empty).toContain('All necessary Magento repositories have been mirrored.');
    });
});

describe('generateLlmsTxt', () => {
    const txt = generateLlmsTxt(makeData(), config);

    test('follows llms.txt structure', () => {
        expect(txt.startsWith('# Mage-OS Dashboard\n\n> ')).toBe(true);
        expect(txt).toContain('## Current data');
        expect(txt).toContain('## Historical data');
        expect(txt).toContain('## Optional');
    });

    test('links current and historical resources and documents content negotiation', () => {
        expect(txt).toContain('[Markdown](/index.md)');
        expect(txt).toContain('https://raw.githubusercontent.com/mage-os/dashboard/data/latest-report.md');
        expect(txt).toContain('Accept: text/markdown');
        expect(txt).toContain('`critical` after 90');
    });
});

describe('generateHeadersFile', () => {
    test('adds Link headers for the root page and Markdown content types', () => {
        const headers = generateHeadersFile();
        expect(headers).toMatch(/^\/\n  Link: <\/index.md>; rel="alternate"; type="text\/markdown"/);
        expect(headers).toContain('/index.md\n  Content-Type: text/markdown; charset=utf-8');
    });
});

describe('HTML agent discovery', () => {
    test('head links advertise markdown and json alternates', () => {
        const links = generateAgentHeadLinks();
        expect(links).toContain('<link rel="alternate" type="text/markdown" href="/index.md"');
        expect(links).toContain('<link rel="alternate" type="application/json" href="/dashboard-data.json"');
    });

    test('visible notice links llms.txt and the data branch', () => {
        const notice = generateAgentNotice();
        expect(notice).toContain('href="/llms.txt"');
        expect(notice).toContain('href="https://github.com/mage-os/dashboard/tree/data"');
    });
});

describe('prefersMarkdown', () => {
    test.each([
        ['text/markdown', true],
        ['text/markdown, text/html, */*', true],
        ['text/markdown, */*;q=0.8', true],
        ['text/html;q=0.9, text/markdown', true],
        ['text/html, text/markdown', false],
        ['text/html, text/markdown;q=0.5', false],
        ['text/markdown;q=0', false],
        ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', false],
        ['*/*', false],
        ['', false],
        [null, false]
    ])('%p -> %p', (accept, expected) => {
        expect(prefersMarkdown(accept)).toBe(expected);
    });
});

describe('generateReport', () => {
    test('escapes titles so table rows stay intact', () => {
        const report = generateReport(makeData());
        const row = report.split('\n').find(line => line.includes('issues/1') && line.startsWith('|'));
        expect(cellCount(row)).toBe(4);
        expect(report).toContain('## Top Action Items');
        expect(report).toContain('age: 30 | labels: 20 | repoActivity: 20');
    });
});
