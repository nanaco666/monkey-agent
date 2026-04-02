import { commitCommand } from './commit.js'
import { planCommand } from './plan.js'
import { memoryCommand } from './memory.js'

export interface SlashCommand {
  name: string
  description: string
  argsPlaceholder?: string          // shown dim after selection, e.g. '[topic]'
  allowedTools: string[]
  buildPrompt: (args: string) => string
}

export const commands: SlashCommand[] = [
  commitCommand,
  planCommand,
  memoryCommand,
]

// Full picker list: slash commands + built-ins (no args needed)
export interface PickerEntry {
  cmd: string            // e.g. '/commit'
  description: string
  argsPlaceholder?: string
}

export const ALL_PICKER_ENTRIES: PickerEntry[] = [
  { cmd: '/commit',  description: 'generate git commit',          argsPlaceholder: '[context]' },
  { cmd: '/plan',    description: 'read-only planning mode',       argsPlaceholder: '[topic]' },
  { cmd: '/memory',  description: 'view and manage memory' },
  { cmd: '/clear',   description: 'clear conversation history' },
  { cmd: '/wild',    description: 'unlock dangerous commands 🐒' },
  { cmd: '/tame',    description: 're-enable safety mode' },
  { cmd: '/help',    description: 'show help' },
]

export function findCommand(name: string): SlashCommand | undefined {
  return commands.find(c => c.name === name)
}
