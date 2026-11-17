import { readFile } from 'fs/promises';
import { DATA_BRANCH_RAW_URL } from './agent-resources.js';
import { toOrgDataMap, toReposWithRuns, toMissingMirrors } from './snapshot-adapter.js';
import {
    generateOrgSection,
    generateWorkflowRunsSectionFromData,
    generateMissingMirrorsSectionFromData,
    generateSummarySection,
    generateRecentActivitySection,
    generateReviewQueueTeaser,
    generateHTML
} from './html-generators.js';
import { generateSiteFiles, writeSiteFiles } from './site-output.js';

export const LATEST_SNAPSHOT_URL = `${DATA_BRANCH_RAW_URL}/latest.json`;

export async function loadSnapshot(localPath = null) {
    if (localPath !== null) {
        return JSON.parse(await readFile(localPath, 'utf-8'));
    }
    const response = await fetch(LATEST_SNAPSHOT_URL);
    if (!response.ok) {
        throw new Error(`Could not fetch snapshot from data branch: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

export function renderIndexFromSnapshot(snapshot, config) {
    const orgDataMap = toOrgDataMap(snapshot);
    const orgSections = Object.entries(orgDataMap)
        .map(([orgName, data]) => generateOrgSection(orgName, data, config))
        .join('');

    return generateHTML(
        generateSummarySection(snapshot.stats, config),
        orgSections,
        generateMissingMirrorsSectionFromData(toMissingMirrors(snapshot)),
        generateWorkflowRunsSectionFromData(toReposWithRuns(snapshot)),
        generateRecentActivitySection(orgDataMap),
        generateReviewQueueTeaser(snapshot, config)
    );
}

/**
 * Builds the full site from an archived snapshot: the given file, or the
 * latest one on the data branch. Needs no GitHub token.
 */
export async function buildSiteFromSnapshot(config, localPath = null) {
    const snapshot = await loadSnapshot(localPath);
    await writeSiteFiles(generateSiteFiles(renderIndexFromSnapshot(snapshot, config), snapshot, config));
    return snapshot;
}
