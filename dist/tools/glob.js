import { globSync } from 'glob';
export const globToolDef = {
    name: 'glob',
    description: 'Find files matching a glob pattern. Returns a list of matching file paths.',
    input_schema: {
        type: 'object',
        properties: {
            pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts"' },
            cwd: { type: 'string', description: 'Directory to search in (default: current directory)' },
        },
        required: ['pattern'],
    },
};
export function runGlob(pattern, cwd) {
    try {
        const files = globSync(pattern, { cwd: cwd || process.cwd(), nodir: true });
        if (files.length === 0)
            return 'No files matched';
        return files.sort().join('\n');
    }
    catch (e) {
        return `Error: ${e.message}`;
    }
}
