import Anthropic from '@anthropic-ai/sdk';
import { toolDefs } from '../tools/index.js';
const SYSTEM_PROMPT_BASE = `You are Monkey, an AI coding assistant running in the terminal.
You help users with software engineering tasks: reading and writing code, running commands, searching files, debugging, and more.

## Rules
- Be concise. No filler words, no unnecessary preamble.
- Use tools to take action rather than just describing what to do.
- Prefer editing existing files over creating new ones.
- Always read a file before editing it.
- When running bash commands, prefer non-interactive ones. Avoid commands that require user input.
- Do not delete files unless explicitly asked.
- When you make a mistake, fix it directly.

## Memory
You have persistent memory across sessions via the memory_write tool.
- Use memory_write to save: user preferences, project context, feedback, and important facts.
- Save memories proactively when you learn something worth remembering.
- Keep memory entries concise and factual.`;
export async function streamResponse(client, config, messages, onText, onToolUse, memoryContext = '') {
    const toolUses = [];
    // Fixed part: cached. Dynamic part (cwd + memory): not cached.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const systemBlocks = [
        {
            type: 'text',
            text: SYSTEM_PROMPT_BASE,
            cache_control: { type: 'ephemeral' },
        },
        {
            type: 'text',
            text: `## Working directory\nCurrent directory: ${process.cwd()}${memoryContext}`,
        },
    ];
    const stream = await client.messages.stream({
        model: config.model,
        max_tokens: 8096,
        system: systemBlocks,
        tools: toolDefs,
        messages,
    });
    let currentToolId = '';
    let currentToolName = '';
    let currentInputJson = '';
    for await (const event of stream) {
        if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
                // text block starting
            }
            else if (event.content_block.type === 'tool_use') {
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentInputJson = '';
                onToolUse(currentToolName, {});
            }
        }
        else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
                onText(event.delta.text);
            }
            else if (event.delta.type === 'input_json_delta') {
                currentInputJson += event.delta.partial_json;
            }
        }
        else if (event.type === 'content_block_stop') {
            if (currentToolId) {
                try {
                    const input = JSON.parse(currentInputJson || '{}');
                    toolUses.push({ id: currentToolId, name: currentToolName, input });
                }
                catch {
                    toolUses.push({ id: currentToolId, name: currentToolName, input: {} });
                }
                currentToolId = '';
                currentToolName = '';
                currentInputJson = '';
            }
        }
    }
    return { toolUses };
}
export function makeClient(config) {
    return new Anthropic({
        apiKey: config.api_key,
        ...(config.base_url ? {
            baseURL: config.base_url,
            // Custom endpoints (proxies, OpenRouter) use Bearer auth instead of x-api-key
            defaultHeaders: { 'Authorization': `Bearer ${config.api_key}` },
        } : {}),
    });
}
