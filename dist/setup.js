import * as readline from 'readline';
import chalk from 'chalk';
import { saveConfig } from './config/index.js';
const PROVIDERS = [
    {
        name: 'Anthropic',
        base_url: undefined,
        model: 'claude-opus-4-5',
        fast_model: 'claude-haiku-4-5-20251001',
        key_url: 'https://console.anthropic.com/',
    },
    {
        name: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-opus-4-5',
        fast_model: 'anthropic/claude-haiku-4-5',
        key_url: 'https://openrouter.ai/keys',
    },
    {
        name: 'Custom endpoint',
        base_url: null,
        model: null,
        fast_model: null,
        key_url: null,
    },
];
function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}
export async function runSetup() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(chalk.rgb(245, 242, 235)('\n  Welcome to Monkey Agent. Let\'s get you set up.\n'));
    // Choose provider
    console.log(chalk.rgb(245, 242, 235)('  Choose a provider:\n'));
    PROVIDERS.forEach((p, i) => {
        console.log(chalk.rgb(240, 183, 49)(`    ${i + 1}.`) + chalk.rgb(245, 242, 235)(` ${p.name}`));
    });
    console.log();
    let providerIdx = 0;
    while (true) {
        const ans = (await ask(rl, chalk.bold.rgb(232, 98, 42)('  Provider [1]: '))).trim() || '1';
        const n = parseInt(ans);
        if (n >= 1 && n <= PROVIDERS.length) {
            providerIdx = n - 1;
            break;
        }
        console.log(chalk.red('  Invalid choice.\n'));
    }
    const provider = PROVIDERS[providerIdx];
    // base_url for custom
    let base_url = provider.base_url;
    if (base_url === null) {
        base_url = (await ask(rl, chalk.bold.rgb(232, 98, 42)('  Base URL: '))).trim();
        if (!base_url) {
            console.log(chalk.red('\n  Base URL is required.\n'));
            rl.close();
            process.exit(1);
        }
    }
    // API key
    if (provider.key_url) {
        console.log(chalk.gray(`\n  Get your API key: ${provider.key_url}\n`));
    }
    const api_key = (await ask(rl, chalk.bold.rgb(232, 98, 42)('  API key: '))).trim();
    if (!api_key) {
        console.log(chalk.red('\n  API key is required.\n'));
        rl.close();
        process.exit(1);
    }
    // Model
    const defaultModel = provider.model || 'claude-opus-4-5';
    const modelInput = (await ask(rl, chalk.bold.rgb(232, 98, 42)(`  Model [${defaultModel}]: `))).trim();
    const model = modelInput || defaultModel;
    const defaultFast = provider.fast_model || model;
    const fastInput = (await ask(rl, chalk.bold.rgb(232, 98, 42)(`  Fast model [${defaultFast}]: `))).trim();
    const fast_model = fastInput || defaultFast;
    rl.close();
    // Save
    const cfg = { api_key, model, fast_model };
    if (base_url)
        cfg.base_url = base_url;
    saveConfig(cfg);
    console.log(chalk.rgb(107, 140, 78)('\n  ✓ Config saved to ~/.monkey-cli/config.json\n'));
}
