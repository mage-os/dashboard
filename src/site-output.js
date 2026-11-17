import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { generateReviewQueueSection, generateReviewQueuePage } from './html-generators.js';
import { generateMarkdownDashboard, generateLlmsTxt, generateHeadersFile } from './agent-docs.js';
import { generateReport } from './report.js';

/**
 * Every file the site publishes, keyed by path relative to the output
 * directory. Shared by the API build and the snapshot build so both always
 * ship the same set of pages and agent-facing copies.
 */
export function generateSiteFiles(indexHtml, dashboardData, config) {
    return {
        'index.html': indexHtml,
        'reviews/index.html': generateReviewQueuePage(generateReviewQueueSection(dashboardData, config)),
        'dashboard-data.json': JSON.stringify(dashboardData, null, 2),
        'index.md': generateMarkdownDashboard(dashboardData, config),
        'report.md': generateReport(dashboardData),
        'llms.txt': generateLlmsTxt(dashboardData, config),
        '_headers': generateHeadersFile()
    };
}

export async function writeSiteFiles(files, outputDirectory = 'dist') {
    for (const [relativePath, content] of Object.entries(files)) {
        const path = join(outputDirectory, relativePath);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
    }
}
