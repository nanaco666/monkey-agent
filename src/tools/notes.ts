import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'

const execAsync = promisify(exec)
const AUTH_FILE = join(homedir(), '.monkey-cli', '.notes_authorized')
const isMac = platform() === 'darwin'

export const notesToolDef = {
  name: 'notes',
  description: 'Manage macOS Notes. Actions: list, show, add, search, folders, delete. macOS only — not available on other platforms.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'show', 'add', 'search', 'folders', 'delete'],
        description: 'Action to perform',
      },
      name: {
        type: 'string',
        description: 'Note name (for show/add/delete)',
      },
      body: {
        type: 'string',
        description: 'Note body content (for add)',
      },
      folder: {
        type: 'string',
        description: 'Folder name (for list/add)',
      },
      keyword: {
        type: 'string',
        description: 'Search keyword (for search)',
      },
    },
    required: ['action'],
  },
}

function isAuthorized(): boolean {
  return existsSync(AUTH_FILE)
}

function markAuthorized(): void {
  writeFileSync(AUTH_FILE, new Date().toISOString())
}

async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 20_000,
    })
    return stdout.trim()
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string }
    const msg = e.stderr || e.message || 'Unknown error'
    if (msg.includes('not allowed') || msg.includes('denied') || msg.includes('(-1743)')) {
      return 'Error: macOS denied access to Notes. Please grant access in System Settings > Privacy & Security > Automation.'
    }
    return `Error: ${msg}`
  }
}

async function authorize(): Promise<string> {
  const result = await runAppleScript('tell application "Notes" to return name of first folder')
  if (result.startsWith('Error:')) {
    return result
  }
  markAuthorized()
  return `Authorization successful.`
}

export async function runNotes(input: Record<string, unknown>): Promise<string> {
  if (!isMac) return 'Error: Notes tool is only available on macOS.'

  const { action, name, body, folder, keyword } = input as {
    action: string; name?: string; body?: string; folder?: string; keyword?: string
  }

  // First-time authorization check
  if (!isAuthorized()) {
    const authResult = await authorize()
    if (authResult.startsWith('Error:')) return authResult
  }

  switch (action) {
    case 'list': {
      if (folder) {
        return await runAppleScript(`
          set output to ""
          tell application "Notes"
            set f to folder "${folder}"
            repeat with n in every note of f
              set d to modification date of n
              set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
              set output to output & dateStr & "  " & name of n & linefeed
            end repeat
          end tell
          return output`)
      } else {
        return await runAppleScript(`
          set output to ""
          tell application "Notes"
            repeat with n in every note
              set d to modification date of n
              set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
              set output to output & dateStr & "  " & name of n & linefeed
            end repeat
          end tell
          return output`)
      }
    }

    case 'show': {
      if (!name) return 'Error: name is required for show action'
      return await runAppleScript(`
        tell application "Notes"
          set matches to (every note whose name is "${name}")
          if length of matches > 0 then
            return plaintext of item 1 of matches
          else
            return "Not found: ${name}"
          end if
        end tell`)
    }

    case 'add': {
      if (!name) return 'Error: name is required for add action'
      const f = folder || 'Notes'
      if (body) {
        const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, '<br>')
        return await runAppleScript(`
          tell application "Notes"
            tell folder "${f}"
              make new note with properties {name:"${name}", body:"<h1>${name}</h1><br>${escapedBody}"}
            end tell
          end tell
          return "Added: ${name}"`)
      } else {
        return await runAppleScript(`
          tell application "Notes"
            tell folder "${f}"
              make new note with properties {name:"${name}", body:"<h1>${name}</h1>"}
            end tell
          end tell
          return "Added: ${name}"`)
      }
    }

    case 'search': {
      if (!keyword) return 'Error: keyword is required for search action'
      return await runAppleScript(`
        set output to ""
        tell application "Notes"
          set matches to (every note whose (name contains "${keyword}") or (plaintext contains "${keyword}"))
          repeat with n in matches
            set d to modification date of n
            set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
            set output to output & dateStr & "  " & name of n & linefeed
          end repeat
        end tell
        return output`)
    }

    case 'folders': {
      return await runAppleScript(`
        set output to ""
        tell application "Notes"
          repeat with f in every folder
            set c to count of notes of f
            set output to output & name of f & " (" & c & ")" & linefeed
          end repeat
        end tell
        return output`)
    }

    case 'delete': {
      if (!name) return 'Error: name is required for delete action'
      return await runAppleScript(`
        tell application "Notes"
          set matches to (every note whose name is "${name}")
          if length of matches > 0 then
            delete item 1 of matches
            return "Deleted: ${name}"
          else
            return "Not found: ${name}"
          end if
        end tell`)
    }

    default:
      return `Error: unknown action "${action}". Use: list|show|add|search|folders|delete`
  }
}
