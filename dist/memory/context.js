import { readMemoryIndex, listTopicFiles } from './store.js';
const MAX_FILES = 5;
// Use fast model to pick relevant topic files for current conversation
async function selectRelevantFiles(client, config, files, recentMessages) {
    if (files.length <= MAX_FILES)
        return files;
    const list = files.map((f, i) => `${i + 1}. [${f.type}] ${f.name} — ${f.description}`).join('\n');
    const res = await client.messages.create({
        model: config.fast_model,
        max_tokens: 100,
        messages: [{
                role: 'user',
                content: `Given this conversation context:\n${recentMessages}\n\nWhich of these memory files are most relevant? Reply with comma-separated numbers only (max ${MAX_FILES}):\n${list}`,
            }],
    });
    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const indices = text.match(/\d+/g)?.map(n => parseInt(n) - 1).filter(i => i >= 0 && i < files.length) ?? [];
    return indices.length > 0 ? indices.map(i => files[i]) : files.slice(0, MAX_FILES);
}
export async function buildMemoryContext(client, config, recentMessages) {
    const index = readMemoryIndex();
    const files = listTopicFiles();
    if (!index && files.length === 0)
        return '';
    const selected = files.length > 0
        ? await selectRelevantFiles(client, config, files, recentMessages)
        : [];
    const parts = [];
    if (index)
        parts.push(`## Memory Index\n${index}`);
    for (const f of selected) {
        parts.push(`## ${f.name} (${f.type})\n${f.body}`);
    }
    return parts.length > 0 ? `\n\n## Persistent Memory\n${parts.join('\n\n')}` : '';
}
