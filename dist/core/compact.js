// Trigger compaction when input tokens exceed this threshold.
// Claude models support 200K context; we compact well before to leave room for responses.
const COMPACT_THRESHOLD = 80_000;
// Number of recent messages to preserve verbatim after compaction.
// Must land on a user-role message boundary (we trim to ensure this).
const KEEP_RECENT = 10;
const SUMMARIZE_PROMPT = `You are summarizing a coding assistant conversation.
Write a concise but complete summary covering:
- What the user asked for and the overall goal
- What was built, changed, or investigated (be specific: file names, functions, decisions)
- Current state of the work and any unresolved issues
- Key facts the assistant should remember going forward

Be specific and technical. Do not add commentary or opinions.`;
export function shouldCompact(inputTokens) {
    return inputTokens >= COMPACT_THRESHOLD;
}
export async function compactMessages(client, config, messages) {
    if (messages.length <= KEEP_RECENT)
        return messages;
    // Split: old messages to summarize, recent ones to keep verbatim
    let keepFrom = messages.length - KEEP_RECENT;
    // Ensure we always start the kept slice on a user message
    while (keepFrom > 0 && messages[keepFrom].role !== 'user')
        keepFrom++;
    if (keepFrom === 0)
        return messages; // nothing to compact
    const toSummarize = messages.slice(0, keepFrom);
    const toKeep = messages.slice(keepFrom);
    // Ask fast model to summarize the old messages
    const response = await client.messages.create({
        model: config.fast_model ?? config.model,
        max_tokens: 2048,
        system: SUMMARIZE_PROMPT,
        messages: [
            ...toSummarize,
            { role: 'user', content: 'Please summarize the conversation above.' },
        ],
    });
    const summary = response.content[0].type === 'text' ? response.content[0].text : '';
    // Replace old messages with a single exchange containing the summary
    const summaryMessages = [
        {
            role: 'user',
            content: `[Conversation summary — earlier context]\n\n${summary}`,
        },
        {
            role: 'assistant',
            content: 'Understood. I have the context from our earlier conversation.',
        },
    ];
    return [...summaryMessages, ...toKeep];
}
