import { writeMemoryFile } from '../memory/store.js';
export const memoryWriteDef = {
    name: 'memory_write',
    description: 'Save information to persistent memory for future sessions. Use this to remember user preferences, project context, feedback, or any important facts.',
    input_schema: {
        type: 'object',
        properties: {
            filename: {
                type: 'string',
                description: 'Filename like "feedback_no_emojis.md" or "project_auth.md". Use snake_case.',
            },
            name: {
                type: 'string',
                description: 'Short title for this memory entry.',
            },
            description: {
                type: 'string',
                description: 'One-line summary shown in the memory index.',
            },
            type: {
                type: 'string',
                enum: ['user', 'feedback', 'project', 'reference'],
                description: 'user=about the user, feedback=behavioral rules, project=project context, reference=external links/IDs',
            },
            content: {
                type: 'string',
                description: 'The memory content in markdown.',
            },
        },
        required: ['filename', 'name', 'description', 'type', 'content'],
    },
};
export function executeMemoryWrite(input) {
    const { filename, name, description, type, content } = input;
    if (!filename.endsWith('.md')) {
        return 'Error: filename must end with .md';
    }
    if (filename === 'MEMORY.md') {
        return 'Error: cannot write directly to MEMORY.md';
    }
    const file = `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n\n${content}\n`;
    writeMemoryFile(filename, file);
    return `Memory saved: ${filename}`;
}
