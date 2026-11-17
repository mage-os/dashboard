import { readFile, writeFile, mkdir } from 'fs/promises';
import { config } from './src/config.js';
import { DATA_BRANCH_RAW_URL } from './src/agent-resources.js';
import { toOrgDataMap, toReposWithRuns, toMissingMirrors } from './src/snapshot-adapter.js';
import {
    generateOrgSection,
    generateWorkflowRunsSectionFromData,
    generateMissingMirrorsSectionFromData,
    generateSummarySection,
    generateRecentActivitySection,
    generateReviewQueueSection,
    generateReviewQueueTeaser,
    generateReviewQueuePage,
    generateHTML
} from './src/html-generators.js';
import { generateMarkdownDashboard, generateLlmsTxt, generateHeadersFile } from './src/agent-docs.js';
import { generateReport } from './src/report.js';

async function loadSnapshot() {
    const localPath = process.argv[2];
    if (localPath) {
        return JSON.parse(await readFile(localPath, 'utf-8'));
    }
    const response = await fetch(`${DATA_BRANCH_RAW_URL}/latest.json`);
    if (!response.ok) {
        throw new Error(`Could not fetch snapshot from data branch: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

const snapshot = await loadSnapshot();
const orgDataMap = toOrgDataMap(snapshot);

const orgSections = Object.entries(orgDataMap)
    .map(([orgName, data]) => generateOrgSection(orgName, data, config))
    .join('');

const html = generateHTML(
    generateSummarySection(snapshot.stats, config),
    orgSections,
    generateMissingMirrorsSectionFromData(toMissingMirrors(snapshot)),
    generateWorkflowRunsSectionFromData(toReposWithRuns(snapshot)),
    generateRecentActivitySection(orgDataMap),
    generateReviewQueueTeaser(snapshot, config)
);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
await mkdir('dist/reviews', { recursive: true });
await writeFile('dist/reviews/index.html', generateReviewQueuePage(generateReviewQueueSection(snapshot, config)));
await writeFile('dist/dashboard-data.json', JSON.stringify(snapshot, null, 2));
await writeFile('dist/index.md', generateMarkdownDashboard(snapshot, config));
await writeFile('dist/report.md', generateReport(snapshot));
await writeFile('dist/llms.txt', generateLlmsTxt(snapshot, config));
await writeFile('dist/_headers', generateHeadersFile());
console.log(`Dashboard generated from snapshot (data captured ${snapshot.generatedAt})`);
