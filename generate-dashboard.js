import { writeFile, mkdir } from 'fs/promises';
import { config, GITHUB_ORGS } from './src/config.js';
import { fetchOrgData, fetchWorkflowRunsForRepo, fetchMagentoRepos } from './src/github-api.js';
import { computeStats, collectDashboardData, collectWorkflowRuns, collectMissingMirrors } from './src/data-processing.js';
import {
    generateOrgSection,
    generateWorkflowRunsSectionFromData,
    generateMissingMirrorsSectionFromData,
    generateSummarySection,
    generateHTML
} from './src/html-generators.js';

const token = process.env.GITHUB_TOKEN;

async function main() {
    try {
        console.log(`Fetching data for organizations: ${GITHUB_ORGS.join(', ')}...`);
        const orgResults = await Promise.all(
            GITHUB_ORGS.map(async (orgName) => {
                try {
                    const data = await fetchOrgData(orgName, token);
                    if (data.errors) {
                        console.error(`Error fetching data for ${orgName}:`, data.errors);
                        return [orgName, null];
                    }
                    return [orgName, data];
                } catch (error) {
                    console.error(`Error fetching data for ${orgName}:`, error);
                    return [orgName, null];
                }
            })
        );
        const orgDataMap = Object.fromEntries(orgResults.filter(([, data]) => data !== null));

        if (Object.keys(orgDataMap).length === 0) {
            throw new Error('No organization data was successfully retrieved');
        }

        console.log('Fetching workflow runs and missing mirrors...');
        const { runsMap, reposWithRuns } = await collectWorkflowRuns(
            orgDataMap,
            (owner, repo) => fetchWorkflowRunsForRepo(owner, repo, token)
        );
        const missingMirrors = await collectMissingMirrors(
            orgDataMap,
            () => fetchMagentoRepos(token),
            config.missingMirrorsIgnoreList
        );

        const dashboardData = collectDashboardData(orgDataMap, runsMap, missingMirrors, config);

        const stats = computeStats(orgDataMap, config.staleThresholds);
        const summarySection = generateSummarySection(stats, config);

        let orgSections = '';
        for (const [orgName, data] of Object.entries(orgDataMap)) {
            orgSections += generateOrgSection(orgName, data, config);
        }

        const missingMirrorsSection = generateMissingMirrorsSectionFromData(missingMirrors);
        const workflowSection = generateWorkflowRunsSectionFromData(reposWithRuns);

        const html = generateHTML(summarySection, orgSections, missingMirrorsSection, workflowSection);

        await mkdir('dist', { recursive: true });
        await writeFile('dist/index.html', html);
        await writeFile('dist/dashboard-data.json', JSON.stringify(dashboardData, null, 2));
        console.log('Dashboard generated successfully!');
        console.log(`JSON data written with ${dashboardData.actionItems.length} action items`);
    } catch (error) {
        console.error('Error generating dashboard:', error);
        process.exit(1);
    }
}

main();
