import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const execAsync = promisify(exec)
const AUTH_FILE = join(homedir(), '.monkey-cli', '.reminders_authorized')

export const remindersToolDef = {
  name: 'reminders',
  description: 'Manage macOS Reminders. Actions: list (overdue|today|upcoming|all), done, add, delete, lists.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'done', 'add', 'delete', 'lists'],
        description: 'Action to perform',
      },
      filter: {
        type: 'string',
        enum: ['overdue', 'today', 'upcoming', 'all'],
        description: 'Filter for list action (default: overdue)',
      },
      name: {
        type: 'string',
        description: 'Reminder name (for done/add/delete)',
      },
      due_date: {
        type: 'string',
        description: 'Due date in YYYY-MM-DD format (for add)',
      },
      list_name: {
        type: 'string',
        description: 'Reminders list name (for add, default: Reminders)',
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
      return 'Error: macOS denied access to Reminders. Please grant access in System Settings > Privacy & Security > Automation.'
    }
    return `Error: ${msg}`
  }
}

async function authorize(): Promise<string> {
  // Try a minimal AppleScript to trigger the authorization prompt
  const result = await runAppleScript('tell application "Reminders" to return name of default list')
  if (result.startsWith('Error:')) {
    return result
  }
  markAuthorized()
  return `Authorization successful. Default list: ${result}`
}

export async function runReminders(input: Record<string, unknown>): Promise<string> {
  const { action, filter, name, due_date, list_name } = input as {
    action: string; filter?: string; name?: string; due_date?: string; list_name?: string
  }

  // First-time authorization check
  if (!isAuthorized()) {
    const authResult = await authorize()
    if (authResult.startsWith('Error:')) return authResult
  }

  switch (action) {
    case 'list': {
      const f = filter || 'overdue'
      const scripts: Record<string, string> = {
        overdue: `
          set output to ""
          tell application "Reminders"
            repeat with r in (every reminder whose completed is false and due date < (current date))
              set d to due date of r
              set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
              set output to output & dateStr & "  " & name of r & linefeed
            end repeat
          end tell
          return output`,
        today: `
          set today to current date
          set time of today to 0
          set tomorrow to today + 86400
          set output to ""
          tell application "Reminders"
            repeat with r in (every reminder whose completed is false and due date ≥ today and due date < tomorrow)
              set d to due date of r
              set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
              set output to output & dateStr & "  " & name of r & linefeed
            end repeat
          end tell
          return output`,
        upcoming: `
          set today to current date
          set nextWeek to today + (7 * 86400)
          set output to ""
          tell application "Reminders"
            repeat with r in (every reminder whose completed is false and due date ≥ today and due date ≤ nextWeek)
              set d to due date of r
              set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
              set output to output & dateStr & "  " & name of r & linefeed
            end repeat
          end tell
          return output`,
        all: `
          set output to ""
          tell application "Reminders"
            repeat with r in (every reminder whose completed is false)
              set d to due date of r
              try
                set dateStr to (year of d as text) & "-" & text -2 thru -1 of ("0" & (month of d as number)) & "-" & text -2 thru -1 of ("0" & (day of d))
              on error
                set dateStr to "no-date"
              end try
              set output to output & dateStr & "  " & name of r & linefeed
            end repeat
          end tell
          return output`,
      }
      if (!scripts[f]) return `Error: unknown filter "${f}". Use: overdue|today|upcoming|all`
      return await runAppleScript(scripts[f])
    }

    case 'done': {
      if (!name) return 'Error: name is required for done action'
      return await runAppleScript(`
        tell application "Reminders"
          set matches to (every reminder whose name is "${name}" and completed is false)
          if length of matches > 0 then
            set completed of item 1 of matches to true
            return "Done: ${name}"
          else
            return "Not found: ${name}"
          end if
        end tell`)
    }

    case 'add': {
      if (!name) return 'Error: name is required for add action'
      const list = list_name || 'Reminders'
      if (due_date) {
        return await runAppleScript(`
          set d to date "${due_date}"
          tell application "Reminders"
            tell list "${list}"
              make new reminder with properties {name:"${name}", due date:d}
            end tell
          end tell
          return "Added: ${name} (due ${due_date})"`)
      } else {
        return await runAppleScript(`
          tell application "Reminders"
            tell list "${list}"
              make new reminder with properties {name:"${name}"}
            end tell
          end tell
          return "Added: ${name}"`)
      }
    }

    case 'delete': {
      if (!name) return 'Error: name is required for delete action'
      return await runAppleScript(`
        tell application "Reminders"
          set matches to (every reminder whose name is "${name}")
          if length of matches > 0 then
            delete item 1 of matches
            return "Deleted: ${name}"
          else
            return "Not found: ${name}"
          end if
        end tell`)
    }

    case 'lists': {
      return await runAppleScript(`
        set output to ""
        tell application "Reminders"
          repeat with l in every list
            set c to count of notes of l
            set output to output & name of l & " (" & c & ")" & linefeed
          end repeat
        end tell
        return output`)
    }

    default:
      return `Error: unknown action "${action}". Use: list|done|add|delete|lists`
  }
}
