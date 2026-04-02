import { commitCommand } from './commit.js'
import { planCommand } from './plan.js'
import { memoryCommand } from './memory.js'

export interface SlashCommand {
  name: string
  description: string
  allowedTools: string[]          // tool names available during this command
  buildPrompt: (args: string) => string
}

export const commands: SlashCommand[] = [
  commitCommand,
  planCommand,
  memoryCommand,
]

export function findCommand(name: string): SlashCommand | undefined {
  return commands.find(c => c.name === name)
}
