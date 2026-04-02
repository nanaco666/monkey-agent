export const memoryCommand = {
    name: 'memory',
    description: 'Show and manage persistent memory',
    allowedTools: ['read', 'memory_write'],
    buildPrompt: (_args) => {
        return `Read the MEMORY.md index file and all referenced memory files in the memory directory.

Then display a clean summary of everything currently remembered:
- List each memory entry with its type (user/feedback/project/reference) and key content
- Flag any entries that look stale, contradictory, or no longer relevant

After displaying, ask the user if they want to update or remove anything.`;
    },
};
