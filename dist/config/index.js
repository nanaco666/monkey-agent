import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
const CONFIG_DIR = join(homedir(), '.monkey-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULTS = {
    model: 'claude-opus-4-6',
    fast_model: 'claude-sonnet-4-6',
};
export function loadConfig() {
    // Priority: env vars > config file > defaults
    const envKey = process.env.MONKEY_API_KEY || process.env.ANTHROPIC_API_KEY;
    let fileConfig = {};
    if (existsSync(CONFIG_FILE)) {
        try {
            fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        }
        catch {
            // ignore malformed config
        }
    }
    const api_key = envKey || fileConfig.api_key || '';
    if (!api_key) {
        console.error([
            '',
            '  No API key found. Set one via:',
            '    monkey config set api_key <key>',
            '  or environment variable:',
            '    export MONKEY_API_KEY=<key>',
            '',
        ].join('\n'));
        process.exit(1);
    }
    return {
        ...DEFAULTS,
        ...fileConfig,
        api_key,
    };
}
export function saveConfig(partial) {
    if (!existsSync(CONFIG_DIR))
        mkdirSync(CONFIG_DIR, { recursive: true });
    const current = existsSync(CONFIG_FILE)
        ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
        : {};
    writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...partial }, null, 2));
}
