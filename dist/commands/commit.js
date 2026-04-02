export const commitCommand = {
    name: 'commit',
    description: 'Generate a git commit message and commit staged changes',
    allowedTools: ['bash'],
    buildPrompt: (args) => {
        const extra = args.trim() ? `\nAdditional context: ${args.trim()}` : '';
        return `You are helping create a git commit.

1. Run \`git status\` to see what has changed.
2. Run \`git diff --staged\` to see staged changes. If nothing is staged, run \`git diff\` to see unstaged changes and stage the relevant files with \`git add\`.
3. Write a concise commit message:
   - First line: short summary (≤72 chars), imperative mood (e.g. "add", "fix", "refactor")
   - Skip the body unless changes are complex
   - No "Co-Authored-By" lines
4. Run \`git commit -m "..."\` with the message.
5. Confirm the commit was created with \`git log --oneline -1\`.${extra}

Only use git commands. Do not push.`;
    },
};
