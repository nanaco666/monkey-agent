import { commitCommand } from './commit.js';
import { planCommand } from './plan.js';
import { memoryCommand } from './memory.js';
export const commands = [
    commitCommand,
    planCommand,
    memoryCommand,
];
export function findCommand(name) {
    return commands.find(c => c.name === name);
}
