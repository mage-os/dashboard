import { config } from './src/config.js';
import { buildSiteFromSnapshot } from './src/snapshot-build.js';

const snapshot = await buildSiteFromSnapshot(config, process.argv[2] ?? null);
console.log(`Dashboard generated from snapshot (data captured ${snapshot.generatedAt})`);
