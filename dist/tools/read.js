import { readFileSync, existsSync } from 'fs';
export const readToolDef = {
    name: 'read',
    description: 'Read the contents of a file. Returns the file content as a string.',
    input_schema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file' },
            start_line: { type: 'number', description: 'First line to read (1-indexed, optional)' },
            end_line: { type: 'number', description: 'Last line to read (1-indexed, optional)' },
        },
        required: ['path'],
    },
};
export function runRead(path, startLine, endLine) {
    if (!existsSync(path))
        return `Error: file not found: ${path}`;
    try {
        const content = readFileSync(path, 'utf-8');
        if (startLine == null && endLine == null)
            return content;
        const lines = content.split('\n');
        const from = (startLine ?? 1) - 1;
        const to = endLine ?? lines.length;
        return lines.slice(from, to).map((l, i) => `${from + i + 1}\t${l}`).join('\n');
    }
    catch (e) {
        return `Error: ${e.message}`;
    }
}
