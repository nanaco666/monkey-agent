import { commitCommand } from './commit.js';
import { planCommand } from './plan.js';
import { memoryCommand } from './memory.js';
export const commands = [
    commitCommand,
    planCommand,
    memoryCommand,
];
export const ALL_PICKER_ENTRIES = [
    { cmd: '/commit', description: 'generate git commit', argsPlaceholder: '[context]' },
    { cmd: '/plan', description: 'read-only planning mode', argsPlaceholder: '[topic]' },
    { cmd: '/memory', description: 'view and manage memory' },
    { cmd: '/clear', description: 'clear conversation history' },
    { cmd: '/wild', description: 'unlock dangerous commands 🐒' },
    { cmd: '/tame', description: 're-enable safety mode' },
    { cmd: '/help', description: 'show help' },
];
export function findCommand(name) {
    return commands.find(c => c.name === name);
}
