import { readFileSync, writeFileSync, existsSync } from 'fs'

export const editToolDef = {
  name: 'edit',
  description: 'Replace an exact string in a file. old_string must match exactly once in the file.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to the file to edit' },
      old_string: { type: 'string', description: 'The exact string to replace (must be unique in the file)' },
      new_string: { type: 'string', description: 'The string to replace it with' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
}

export function runEdit(path: string, oldString: string, newString: string): string {
  if (!existsSync(path)) return `Error: file not found: ${path}`
  try {
    const content = readFileSync(path, 'utf-8')
    const count = content.split(oldString).length - 1
    if (count === 0) return `Error: old_string not found in ${path}`
    if (count > 1) return `Error: old_string matches ${count} times — make it more specific`
    writeFileSync(path, content.replace(oldString, newString), 'utf-8')
    return `Edited ${path}`
  } catch (e: unknown) {
    return `Error: ${(e as Error).message}`
  }
}
