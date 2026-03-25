import { readFile } from 'fs/promises';

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf-8'));
const GITHUB_ORGS = config.organizations;

export { config, GITHUB_ORGS };
