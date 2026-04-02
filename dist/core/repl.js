import * as readline from 'readline';
import chalk from 'chalk';
import { streamResponse } from './api.js';
import { executeTool } from '../tools/index.js';
import { spinner } from '../ui/spinner.js';
import { kaomoji } from '../ui/kaomoji.js';
import { buildMemoryContext } from '../memory/context.js';
import { appendSession } from '../memory/store.js';
const PROMPT = chalk.bold.rgb(232, 98, 42)('❯ ');
const SLOW_TOOL_MS = 300; // show spinner only if tool takes longer than this
const TOOL_MESSAGES = {
    bash: 'running...',
    read: 'reading...',
    write: 'scribbling...',
    edit: 'scribbling...',
    glob: 'searching...',
    grep: 'searching...',
};
const WRITE_TOOLS = new Set(['write', 'edit']);
function toolColor(name) {
    return WRITE_TOOLS.has(name) ? chalk.rgb(107, 140, 78) : chalk.dim;
}
function printToolCall(name, input) {
    if (name === 'memory_write') {
        process.stdout.write(chalk.rgb(240, 183, 49)(`\n  ◆ memory  ${input.name ?? ''}\n`));
        return;
    }
    const color = toolColor(name);
    const detail = input.command ?? input.path ?? input.pattern ?? '';
    const summary = typeof detail === 'string' ? detail.slice(0, 60) : '';
    process.stdout.write(color(`\n  ◆ ${name}${summary ? '  ' + summary : ''}\n`));
}
function printToolResult(name, result, elapsed) {
    if (name === 'memory_write') {
        const isError = result.startsWith('Error:');
        process.stdout.write(isError ? chalk.red(`    ✗ ${result}\n`) : chalk.rgb(240, 183, 49)(`    → remembered\n`));
        return;
    }
    const isError = result.startsWith('Error:');
    const isWrite = WRITE_TOOLS.has(name);
    if (isError) {
        const msg = result.split('\n')[0].slice(0, 80);
        process.stdout.write(chalk.red(`    ✗ ${msg}\n`));
        return;
    }
    if (isWrite) {
        process.stdout.write(chalk.rgb(107, 140, 78)(`    → saved\n`));
        return;
    }
    const firstLine = result.split('\n')[0].slice(0, 60);
    const lineCount = result.split('\n').length;
    const summary = lineCount > 1 ? `${firstLine}  (${lineCount} lines)` : firstLine;
    const timeHint = elapsed > 1000 ? chalk.dim(` ${(elapsed / 1000).toFixed(1)}s`) : '';
    process.stdout.write(chalk.dim(`    → ${summary}${timeHint}\n`));
}
// Returns the display width of a single character (wide chars like CJK/emoji = 2)
function charDisplayWidth(ch) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x1100 && cp <= 0x115F) || // Hangul Jamo
        cp === 0x2329 || cp === 0x232A ||
        (cp >= 0x2E80 && cp <= 0x303E) || // CJK Radicals
        (cp >= 0x3040 && cp <= 0x33FF) || // Japanese
        (cp >= 0x3400 && cp <= 0x4DBF) || // CJK Extension A
        (cp >= 0x4E00 && cp <= 0x9FFF) || // CJK Unified
        (cp >= 0xA000 && cp <= 0xA4CF) || // Yi
        (cp >= 0xAC00 && cp <= 0xD7AF) || // Hangul Syllables
        (cp >= 0xF900 && cp <= 0xFAFF) || // CJK Compatibility
        (cp >= 0xFE10 && cp <= 0xFE1F) || // Vertical Forms
        (cp >= 0xFE30 && cp <= 0xFE4F) || // CJK Compatibility Forms
        (cp >= 0xFE50 && cp <= 0xFE6F) || // Small Forms
        (cp >= 0xFF00 && cp <= 0xFF60) || // Fullwidth Forms
        (cp >= 0xFFE0 && cp <= 0xFFE6) || // Fullwidth Signs
        (cp >= 0x1F300 && cp <= 0x1F9FF) || // Emoji
        (cp >= 0x20000 && cp <= 0x2FFFD) || // CJK Extension B-F
        (cp >= 0x30000 && cp <= 0x3FFFD))
        return 2;
    return 1;
}
function segmentDisplayWidth(seg) {
    if (seg.kind === 'paste')
        return seg.label.length; // ASCII label, all width-1
    return [...seg.text].reduce((sum, ch) => sum + charDisplayWidth(ch), 0);
}
function readUserInput(prompt) {
    return new Promise(resolve => {
        process.stdout.write(prompt);
        // Enable bracketed paste mode
        process.stdout.write('\x1B[?2004h');
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY)
            process.stdin.setRawMode(true);
        // Segments track what's displayed vs what's in the logical input.
        // Last segment absorbs typed chars; paste events push a new PasteSegment.
        const segments = [{ kind: 'typed', text: '' }];
        let ctrlCCount = 0;
        let pasting = false;
        let pasteBuffer = '';
        // Logical input = concatenation of all segment texts
        const fullInput = () => segments.map(s => s.text).join('');
        const finish = (value) => {
            process.stdin.removeListener('keypress', onKey);
            if (process.stdin.isTTY)
                process.stdin.setRawMode(false);
            process.stdout.write('\x1B[?2004l'); // disable bracketed paste
            resolve(value);
        };
        const onKey = (_, key) => {
            if (!key)
                return;
            // ── Bracketed paste start ──────────────────────────────────────────────
            if (key.sequence === '\x1B[200~') {
                pasting = true;
                pasteBuffer = '';
                return;
            }
            // ── Bracketed paste end ────────────────────────────────────────────────
            if (key.sequence === '\x1B[201~') {
                pasting = false;
                const cleaned = pasteBuffer.replace(/\r?\n/g, ' ').trim();
                pasteBuffer = '';
                if (!cleaned)
                    return;
                // Label shown inline on the prompt line (cursor tracks this)
                const label = `[pasted ${cleaned.length} chars]`;
                // Preview shown below so the user can verify what will be sent
                const preview = cleaned.length > 120 ? cleaned.slice(0, 120) + '…' : cleaned;
                // Push a dedicated paste segment
                segments.push({ kind: 'paste', text: cleaned, label });
                // Always push a fresh typed segment after a paste so subsequent typing
                // goes into a separate segment (easier backspace logic)
                segments.push({ kind: 'typed', text: '' });
                // Print the label inline, then the preview on a new line, then redraw
                // the prompt so the cursor is back on the input line showing the label.
                process.stdout.write(chalk.dim(label));
                process.stdout.write(chalk.dim(`\n  ${preview}\n`));
                process.stdout.write(prompt);
                // Redraw everything before the just-added paste segment
                for (let i = 0; i < segments.length - 2; i++) {
                    const s = segments[i];
                    if (s.kind === 'typed') {
                        process.stdout.write(s.text);
                    }
                    else {
                        process.stdout.write(chalk.gray(s.label));
                    }
                }
                process.stdout.write(chalk.dim(label));
                return;
            }
            // ── Buffer during paste ────────────────────────────────────────────────
            if (pasting) {
                pasteBuffer += key.sequence ?? '';
                return;
            }
            // ── Ctrl+C ────────────────────────────────────────────────────────────
            if (key.ctrl && key.name === 'c') {
                ctrlCCount++;
                if (ctrlCCount >= 2) {
                    process.stdout.write('\n');
                    finish(null);
                    return;
                }
                process.stdout.write(chalk.dim(`\n  (Ctrl+C again to exit)  ${kaomoji.upset()}\n`));
                process.stdout.write(prompt);
                // Reset to a single empty typed segment
                segments.length = 0;
                segments.push({ kind: 'typed', text: '' });
                setTimeout(() => { ctrlCCount = 0; }, 2000);
                return;
            }
            ctrlCCount = 0;
            // ── Enter ──────────────────────────────────────────────────────────────
            if (key.name === 'return') {
                process.stdout.write('\n');
                finish(fullInput());
                return;
            }
            // ── Backspace ──────────────────────────────────────────────────────────
            if (key.name === 'backspace') {
                // Find the last non-empty segment
                while (segments.length > 1) {
                    const last = segments[segments.length - 1];
                    if (last.kind === 'typed' && last.text.length === 0) {
                        // Empty trailing typed segment — check the one before it
                        const prev = segments[segments.length - 2];
                        if (prev.kind === 'paste') {
                            // Erase the whole paste label at once
                            const w = prev.label.length;
                            segments.splice(segments.length - 2, 2); // remove paste + empty typed
                            process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`);
                            return;
                        }
                        else {
                            // Two consecutive typed segments — merge by popping the empty one
                            segments.pop();
                            continue;
                        }
                    }
                    break;
                }
                const last = segments[segments.length - 1];
                if (last.kind === 'paste') {
                    // Shouldn't normally happen (we always add typed after paste),
                    // but handle defensively: erase the whole label
                    const w = last.label.length;
                    segments.pop();
                    process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`);
                }
                else {
                    // Typed segment: remove last code point
                    const chars = [...last.text];
                    if (chars.length > 0) {
                        const lastChar = chars[chars.length - 1];
                        const w = charDisplayWidth(lastChar);
                        last.text = chars.slice(0, -1).join('');
                        process.stdout.write(`\x1B[${w}D${' '.repeat(w)}\x1B[${w}D`);
                    }
                }
                return;
            }
            // ── Regular character ──────────────────────────────────────────────────
            if (key.sequence && !key.ctrl && !key.name?.startsWith('f') && key.sequence >= ' ') {
                const last = segments[segments.length - 1];
                if (last.kind === 'typed') {
                    last.text += key.sequence;
                }
                else {
                    // After a paste segment that somehow has no trailing typed seg
                    segments.push({ kind: 'typed', text: key.sequence });
                }
                process.stdout.write(key.sequence);
            }
        };
        process.stdin.on('keypress', onKey);
    });
}
const DANGEROUS_PATTERNS = [
    /\brm\s/,
    /\brmdir\b/,
    /git\s+push\s+.*(-f|--force)\b/,
    /\bchmod\b.*\/(bin|etc|usr|sys|proc)\b/,
    /\b(kill|pkill)\b/,
    /\|\s*(bash|sh)\b/,
];
function isDangerous(command) {
    return DANGEROUS_PATTERNS.some(p => p.test(command));
}
export async function startRepl(client, config) {
    const messages = [];
    let memoryContext = '';
    let wildMode = false;
    const getPrompt = () => wildMode
        ? chalk.bold.rgb(232, 98, 42)('🐒 ❯ ')
        : chalk.bold.rgb(232, 98, 42)('❯ ');
    // Load memory context once at startup
    try {
        spinner.start('loading memory...');
        memoryContext = await buildMemoryContext(client, config, '');
        spinner.stop();
        if (memoryContext)
            process.stdout.write(chalk.dim('  ◆ memory  context loaded\n'));
    }
    catch {
        spinner.stop();
    }
    const handleSlash = (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === '/clear') {
            messages.length = 0;
            console.log(chalk.rgb(100, 181, 246)('\n  ✦ Conversation cleared.\n'));
            return true;
        }
        if (cmd === '/wild') {
            wildMode = true;
            console.log(chalk.rgb(240, 183, 49)('\n  🐒 wild mode — all commands allowed\n'));
            return true;
        }
        if (cmd === '/tame') {
            wildMode = false;
            console.log(chalk.rgb(100, 181, 246)('\n  ✦ tame mode — dangerous commands blocked\n'));
            return true;
        }
        if (cmd === '/help') {
            console.log(chalk.rgb(245, 242, 235)([
                '',
                '  /clear   clear conversation history',
                '  /model   show current model',
                '  /wild    unlock dangerous commands 🐒',
                '  /tame    re-enable safety mode',
                '  /help    show this help',
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
    process.stdout.write('\n');
    while (true) {
        const userInput = await readUserInput(getPrompt());
        // null means double Ctrl+C → exit
        if (userInput === null) {
            console.log(chalk.rgb(245, 242, 235)(`\n  bye ${kaomoji.random()}\n`));
            process.exit(0);
        }
        const trimmed = userInput.trim();
        if (!trimmed)
            continue;
        if (trimmed.startsWith('/')) {
            if (handleSlash(trimmed))
                continue;
        }
        messages.push({ role: 'user', content: trimmed });
        appendSession({ ts: new Date().toISOString(), role: 'user', content: trimmed });
        console.log();
        let responseText = '';
        let thinkingTimer = null;
        const clearThinking = () => {
            if (thinkingTimer) {
                clearTimeout(thinkingTimer);
                thinkingTimer = null;
            }
            spinner.stop();
        };
        try {
            while (true) {
                responseText = '';
                let thinkingStarted = false;
                thinkingTimer = setTimeout(() => {
                    thinkingStarted = true;
                    spinner.start('thinking...');
                }, SLOW_TOOL_MS);
                const { toolUses } = await streamResponse(client, config, messages, (text) => {
                    if (!thinkingStarted) {
                        clearTimeout(thinkingTimer);
                        thinkingTimer = null;
                    }
                    else {
                        clearThinking();
                        thinkingStarted = false;
                    }
                    process.stdout.write(text); // use terminal's native foreground color
                    responseText += text;
                }, (_name, _input) => {
                    clearThinking();
                    thinkingStarted = false;
                }, memoryContext);
                clearThinking();
                if (responseText) {
                    process.stdout.write('\n');
                    appendSession({ ts: new Date().toISOString(), role: 'assistant', content: responseText });
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const assistantBlocks = [];
                if (responseText)
                    assistantBlocks.push({ type: 'text', text: responseText });
                for (const t of toolUses) {
                    assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
                }
                if (assistantBlocks.length > 0) {
                    messages.push({ role: 'assistant', content: assistantBlocks });
                }
                if (toolUses.length === 0)
                    break;
                const toolResults = [];
                for (const t of toolUses) {
                    printToolCall(t.name, t.input);
                    // spinner for slow tools
                    let slowTimer = null;
                    let spinnerShown = false;
                    const toolMsg = TOOL_MESSAGES[t.name] ?? 'working...';
                    slowTimer = setTimeout(() => {
                        spinnerShown = true;
                        spinner.start(toolMsg);
                    }, SLOW_TOOL_MS);
                    // tame mode: block dangerous bash commands
                    if (!wildMode && t.name === 'bash' && isDangerous(t.input.command ?? '')) {
                        if (slowTimer)
                            clearTimeout(slowTimer);
                        const blocked = 'Error: command blocked in tame mode. Switch to wild mode with /wild to allow.';
                        printToolResult(t.name, blocked, 0);
                        toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: blocked });
                        continue;
                    }
                    const start = Date.now();
                    const result = await executeTool(t.name, t.input);
                    const elapsed = Date.now() - start;
                    if (slowTimer)
                        clearTimeout(slowTimer);
                    if (spinnerShown)
                        spinner.stop();
                    printToolResult(t.name, result, elapsed);
                    toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: result });
                }
                messages.push({ role: 'user', content: toolResults });
                console.log();
            }
        }
        catch (err) {
            clearThinking();
            const msg = err.message || String(err);
            console.log(chalk.red(`\n  ✗ ${msg}`));
            console.log(chalk.rgb(240, 183, 49)(`  ${kaomoji.crash()}\n`));
        }
        process.stdout.write('\n');
    }
}
