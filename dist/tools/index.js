import { bashToolDef, runBash } from './bash.js';
import { readToolDef, runRead } from './read.js';
import { writeToolDef, runWrite } from './write.js';
import { editToolDef, runEdit } from './edit.js';
import { globToolDef, runGlob } from './glob.js';
import { grepToolDef, runGrep } from './grep.js';
import { memoryWriteDef, executeMemoryWrite } from './memory.js';
export const toolDefs = [
    bashToolDef,
    readToolDef,
    writeToolDef,
    editToolDef,
    globToolDef,
    grepToolDef,
    memoryWriteDef,
];
export async function executeTool(name, input) {
    switch (name) {
        case 'bash':
            return runBash(input.command, input.timeout_ms);
        case 'read':
            return runRead(input.path, input.start_line, input.end_line);
        case 'write':
            return runWrite(input.path, input.content);
        case 'edit':
            return runEdit(input.path, input.old_string, input.new_string);
        case 'glob':
            return runGlob(input.pattern, input.cwd);
        case 'grep':
            return runGrep(input.pattern, input.path, input.glob, input.case_insensitive);
        case 'memory_write':
            return executeMemoryWrite(input);
        default:
            return `Error: unknown tool "${name}"`;
    }
}
