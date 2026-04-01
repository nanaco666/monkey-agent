import * as readline from 'readline';
import chalk from 'chalk';
import { streamResponse } from './api.js';
import { executeTool } from '../tools/index.js';
const PROMPT = chalk.bold.rgb(232, 98, 42)('❯ ');
const TOOL_COLORS = {
    read: (s) => chalk.gray(s),
    glob: (s) => chalk.gray(s),
    grep: (s) => chalk.gray(s),
    write: (s) => chalk.rgb(107, 140, 78)(s),
    edit: (s) => chalk.rgb(107, 140, 78)(s),
    bash: (s) => chalk.gray(s),
};
function printToolCall(name, input) {
    const color = TOOL_COLORS[name] ?? chalk.gray;
    const detail = input.command ?? input.path ?? input.pattern ?? '';
    process.stdout.write(color(`  ◆ ${name}${detail ? ': ' + detail : ''}\n`));
}
function printToolResult(name, result) {
    const isWrite = name === 'write' || name === 'edit';
    const isError = result.startsWith('Error:');
    const color = isError
        ? chalk.red
        : isWrite
            ? chalk.rgb(107, 140, 78)
            : chalk.gray;
    // show only first line of result as summary
    const summary = result.split('\n')[0];
    process.stdout.write(color(`    → ${summary}\n`));
}
export async function startRepl(client, config) {
    const messages = [];
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });
    // handle /clear
    const handleSlash = (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === '/clear') {
            messages.length = 0;
            console.log(chalk.rgb(100, 181, 246)('  ✦ Conversation cleared.\n'));
            return true;
        }
        if (cmd === '/help') {
            console.log(chalk.rgb(245, 242, 235)([
                '',
                '  /clear   clear conversation history',
                '  /help    show this help',
                '  /model   show current model',
                '',
                '  Ctrl+C   interrupt response',
                '  Ctrl+C×2 exit',
                '',
            ].join('\n')));
            return true;
        }
        if (cmd === '/model') {
            console.log(chalk.rgb(245, 242, 235)(`\n  model: ${config.model}\n`));
            return true;
        }
        return false;
    };
    const askQuestion = () => {
        rl.question(PROMPT, async (userInput) => {
            const trimmed = userInput.trim();
            if (!trimmed) {
                askQuestion();
                return;
            }
            // slash commands
            if (trimmed.startsWith('/')) {
                if (handleSlash(trimmed)) {
                    askQuestion();
                    return;
                }
            }
            messages.push({ role: 'user', content: trimmed });
            console.log();
            let responseText = '';
            try {
                // agentic loop: keep going until no more tool calls
                while (true) {
                    const assistantContent = [];
                    responseText = '';
                    const { toolUses } = await streamResponse(client, config, messages, (text) => {
                        process.stdout.write(chalk.white(text));
                        responseText += text;
                    }, (name, input) => {
                        printToolCall(name, input);
                    });
                    if (responseText)
                        process.stdout.write('\n');
                    // build assistant message content
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const assistantBlocks = [];
                    if (responseText) {
                        assistantBlocks.push({ type: 'text', text: responseText });
                    }
                    for (const t of toolUses) {
                        assistantBlocks.push({
                            type: 'tool_use',
                            id: t.id,
                            name: t.name,
                            input: t.input,
                        });
                    }
                    if (assistantBlocks.length > 0) {
                        messages.push({ role: 'assistant', content: assistantBlocks });
                    }
                    if (toolUses.length === 0)
                        break;
                    // execute tools and add results
                    const toolResults = [];
                    for (const t of toolUses) {
                        const result = await executeTool(t.name, t.input);
                        printToolResult(t.name, result);
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: t.id,
                            content: result,
                        });
                    }
                    messages.push({ role: 'user', content: toolResults });
                    console.log();
                }
            }
            catch (err) {
                const msg = err.message || String(err);
                console.log(chalk.red(`\n  ✗ ${msg}\n`));
            }
            console.log();
            askQuestion();
        });
    };
    askQuestion();
    // Ctrl+C handling
    let ctrlCCount = 0;
    rl.on('SIGINT', () => {
        ctrlCCount++;
        if (ctrlCCount >= 2) {
            console.log(chalk.rgb(245, 242, 235)('\n\n  bye 🐒\n'));
            process.exit(0);
        }
        process.stdout.write(chalk.gray('\n  (Ctrl+C again to exit)\n') + PROMPT);
        setTimeout(() => { ctrlCCount = 0; }, 2000);
    });
}
