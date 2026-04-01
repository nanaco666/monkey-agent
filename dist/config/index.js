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
    // No config file = must run setup
    if (!existsSync(CONFIG_FILE))
        return null;
    let fileConfig = {};
    try {
        fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
    catch {
        return null;
    }
    const api_key = fileConfig.api_key || '';
    if (!api_key)
        return null;
    return {
        ...DEFAULTS,
        ...fileConfig,
        api_key,
    };
}
// Env vars for setup pre-fill only
export function getEnvDefaults() {
    return {
        api_key: process.env.MONKEY_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        base_url: process.env.MONKEY_BASE_URL || process.env.ANTHROPIC_BASE_URL || '',
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
