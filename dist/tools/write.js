import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
export const writeToolDef = {
    name: 'write',
    description: 'Write content to a file, creating it or overwriting it entirely.',
    input_schema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Path to the file to write' },
            content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
    },
};
export function runWrite(path, content) {
    try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf-8');
        const lines = content.split('\n').length;
        return `Written ${lines} lines to ${path}`;
    }
    catch (e) {
        return `Error: ${e.message}`;
    }
}
