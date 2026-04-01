import { bashToolDef, runBash } from './bash.js'
import { readToolDef, runRead } from './read.js'
import { writeToolDef, runWrite } from './write.js'
import { editToolDef, runEdit } from './edit.js'
import { globToolDef, runGlob } from './glob.js'
import { grepToolDef, runGrep } from './grep.js'
import { memoryWriteDef, executeMemoryWrite } from './memory.js'

export const toolDefs = [
  bashToolDef,
  readToolDef,
  writeToolDef,
  editToolDef,
  globToolDef,
  grepToolDef,
  memoryWriteDef,
]

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'bash':
      return runBash(input.command as string, input.timeout_ms as number | undefined)
    case 'read':
      return runRead(input.path as string, input.start_line as number | undefined, input.end_line as number | undefined)
    case 'write':
      return runWrite(input.path as string, input.content as string)
    case 'edit':
      return runEdit(input.path as string, input.old_string as string, input.new_string as string)
    case 'glob':
      return runGlob(input.pattern as string, input.cwd as string | undefined)
    case 'grep':
      return runGrep(input.pattern as string, input.path as string | undefined, input.glob as string | undefined, input.case_insensitive as boolean | undefined)
    case 'memory_write':
      return executeMemoryWrite(input)
    default:
      return `Error: unknown tool "${name}"`
  }
}
