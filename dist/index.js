#!/usr/bin/env node
import { loadConfig } from './config/index.js';
import { printBanner } from './banner.js';
import { makeClient } from './core/api.js';
import { startRepl } from './core/repl.js';
// handle: monkey config set api_key <key>
const args = process.argv.slice(2);
if (args[0] === 'config' && args[1] === 'set' && args[2] === 'api_key' && args[3]) {
    const { saveConfig } = await import('./config/index.js');
    saveConfig({ api_key: args[3] });
    console.log('API key saved to ~/.monkey-cli/config.json');
    process.exit(0);
}
const config = loadConfig();
const client = makeClient(config);
printBanner(config.model);
await startRepl(client, config);
