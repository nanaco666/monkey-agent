import type { Config } from '../config/index.js'
import type { Message } from './api.js'
import { simpleChat } from './api.js'
import { writeMemoryFile } from '../memory/store.js'

// Trigger compaction when input tokens exceed this threshold.
// Claude models support 200K context; we compact well before to leave room for responses.
const COMPACT_THRESHOLD = 80_000

// Number of recent messages to preserve verbatim after compaction.
// Must land on a user-role message boundary (we trim to ensure this).
const KEEP_RECENT = 10

const SUMMARIZE_PROMPT = `You are summarizing a coding assistant conversation.
Write a concise but complete summary covering:
- What the user asked for and the overall goal
- What was built, changed, or investigated (be specific: file names, functions, decisions)
- Current state of the work and any unresolved issues
- Key facts the assistant should remember going forward

Be specific and technical. Do not add commentary or opinions.`

const EXTRACT_PROMPT = `You are a knowledge extraction assistant. Review the conversation below and extract NEW, IMPORTANT knowledge that should be saved for future sessions.

Rules:
- Only extract things that are NOT obvious or trivial
- Focus on: user preferences/corrections, project-specific patterns, discovered tools/workflows, key decisions
- Do NOT extract: things already in memory, general knowledge, the conversation summary itself

Output format — for each piece of knowledge, output one line:
SAVE | <type> | <name> | <description> | <content>

Where:
- type: one of user, feedback, project, reference
- name: short snake_case identifier (e.g. "feedback_no_emojis", "project_auth_pattern")
- description: one-line summary for the memory index
- content: the full knowledge in markdown

If nothing worth saving, output: NONE`

export function shouldCompact(inputTokens: number): boolean {
  return inputTokens >= COMPACT_THRESHOLD
}

/**
 * Extract knowledge from messages about to be compacted.
 * Returns number of memory entries saved.
 */
async function extractKnowledge(
  config: Config,
  messages: Message[],
): Promise<number> {
  const model = config.fast_model ?? config.model
  const res = await simpleChat(
    config,
    model,
    EXTRACT_PROMPT,
    [
      ...messages,
      { role: 'user', content: 'Extract knowledge worth remembering from this conversation.' },
    ],
    1024,
  )

  const lines = res.text.trim().split('\n').filter(l => l.startsWith('SAVE |'))
  if (lines.length === 0) return 0

  let saved = 0
  for (const line of lines) {
    const parts = line.split(' | ')
    if (parts.length < 5) continue

    const type = parts[1].trim()
    const name = parts[2].trim()
    const description = parts[3].trim()
    const content = parts.slice(4).join(' | ').trim()

    if (!name || !content) continue
    if (!['user', 'feedback', 'project', 'reference'].includes(type)) continue

    const filename = `${name.endsWith('.md') ? name : name + '.md'}`
    const file = `---\nname: ${name}\ndescription: ${description}\ntype: ${type}\n---\n\n${content}\n`
    try {
      writeMemoryFile(filename, file)
      saved++
    } catch { /* skip if write fails */ }
  }

  return saved
}

export async function compactMessages(
  config: Config,
  messages: Message[],
): Promise<{ messages: Message[]; knowledgeSaved: number }> {
  if (messages.length <= KEEP_RECENT) return { messages, knowledgeSaved: 0 }

  // Split: old messages to summarize, recent ones to keep verbatim
  let keepFrom = messages.length - KEEP_RECENT
  // Ensure we always start the kept slice on a user message
  while (keepFrom > 0 && messages[keepFrom].role !== 'user') keepFrom++
  if (keepFrom === 0) return { messages, knowledgeSaved: 0 } // nothing to compact

  const toSummarize = messages.slice(0, keepFrom)
  const toKeep = messages.slice(keepFrom)

  // Step 1: Extract knowledge BEFORE summarizing (information is about to be lost)
  let knowledgeSaved = 0
  try {
    knowledgeSaved = await extractKnowledge(config, toSummarize)
  } catch { /* extraction failure should not block compact */ }

  // Step 2: Summarize the old messages
  const model = config.fast_model ?? config.model
  const response = await simpleChat(
    config,
    model,
    SUMMARIZE_PROMPT,
    [
      ...toSummarize,
      { role: 'user', content: 'Please summarize the conversation above.' },
    ],
  )

  const summary = response.text

  // Replace old messages with a single exchange containing the summary
  const summaryMessages: Message[] = [
    {
      role: 'user',
      content: `[Conversation summary — earlier context]\n\n${summary}`,
    },
    {
      role: 'assistant',
      content: 'Understood. I have the context from our earlier conversation.',
    },
  ]

  return {
    messages: [...summaryMessages, ...toKeep],
    knowledgeSaved,
  }
}
