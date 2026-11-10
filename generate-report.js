import { readFile, writeFile, mkdir } from 'fs/promises';
import { generateReport } from './src/report.js';

const data = JSON.parse(await readFile('dist/dashboard-data.json', 'utf-8'));

await mkdir('dist', { recursive: true });
await writeFile('dist/report.md', generateReport(data));
console.log('Report generated: dist/report.md');
