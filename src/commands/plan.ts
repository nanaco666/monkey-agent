import type { SlashCommand } from './index.js'

export const planCommand: SlashCommand = {
  name: 'plan',
  description: 'Read-only planning mode — think through approach without editing files',
  allowedTools: ['read', 'glob', 'grep'],
  buildPrompt: (args: string) => {
    const topic = args.trim() || 'the current task'
    return `You are in planning mode. You can read files but cannot write or execute commands.

Think through: ${topic}

Explore the codebase as needed, then provide:
1. Clear understanding of the current state
2. Proposed approach with specific steps
3. Files that will need to change and why
4. Any risks or trade-offs to consider

Be specific and concrete. No vague suggestions.`
  },
}
