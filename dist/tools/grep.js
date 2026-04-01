import { execSync } from 'child_process';
export const grepToolDef = {
    name: 'grep',
    description: 'Search for a pattern in files using ripgrep (rg) or grep. Returns matching lines with file and line number.',
    input_schema: {
        type: 'object',
        properties: {
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            path: { type: 'string', description: 'File or directory to search in (default: current directory)' },
            glob: { type: 'string', description: 'File glob filter, e.g. "*.ts"' },
            case_insensitive: { type: 'boolean', description: 'Case insensitive search' },
        },
        required: ['pattern'],
    },
};
export function runGrep(pattern, path, glob, caseInsensitive) {
    try {
        const target = path || '.';
        const iFlag = caseInsensitive ? '-i' : '';
        const globFlag = glob ? `--glob '${glob}'` : '';
        // prefer rg, fallback to grep
        const cmd = `rg --no-heading -n ${iFlag} ${globFlag} '${pattern.replace(/'/g, "'\\''")}' ${target} 2>/dev/null || grep -rn ${iFlag} '${pattern.replace(/'/g, "'\\''")}' ${target}`;
        const result = execSync(cmd, { maxBuffer: 1024 * 1024 * 5 }).toString().trim();
        return result || 'No matches found';
    }
    catch {
        return 'No matches found';
    }
}
