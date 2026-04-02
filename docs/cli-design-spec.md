# Monkey CLI Design Spec

## Colors

| Role | RGB | Usage |
|------|-----|-------|
| Primary / selected | (232, 98, 42) orange | Prompt `❯`, selected item, key labels |
| Text / body | (245, 242, 235) cream | Normal text, labels, values |
| Muted / secondary | gray | Unselected items, tool output, hints |
| Success | (107, 140, 78) green | Confirmations, write operations |
| Error | red | Error messages |
| Accent yellow | (240, 183, 49) | Kaomoji, numbered list indices |

## Spacing

- All content indented 2 spaces from left edge
- One blank line before each section
- One blank line after each section
- No trailing blank lines at end of output

## Interactive Selector

Used for any single-choice selection (provider, model, etc.).

### Rendering rules

1. Hide cursor before rendering: `\x1B[?25l`
2. On first render: print label line + all items
3. On re-render: move cursor up to label position, then clear to end of screen `\x1B[0J`, then redraw
4. Show cursor after selection: `\x1B[?25h`

### Visual format

```
  Label text:

    ❯ Selected item        ← orange bold
      Unselected item      ← gray
      Unselected item      ← gray
```

- Selected item: `❯` prefix, orange bold
- Unselected: 6-space indent (aligns with selected text after `❯ `), gray
- One blank line between label and items

### Controls

- `↑` / `↓` — move selection
- `Enter` — confirm
- `Ctrl+C` — exit

## Text Input

```
  Label: ▌
```

- Label in orange bold
- Value typed inline
- Hint/default shown in brackets: `Label [default]: `

### Implementation: never use readline for any TTY input

Two separate issues require avoiding readline entirely:

1. `readline.createInterface()` + `rl.close()` destroys the underlying stdin stream — subsequent raw keypress listeners stop receiving events.
2. `readline.createInterface({ terminal: true })` does its own cursor management that conflicts with direct `process.stdout.write()` calls — text written to stdout can be overwritten/erased by readline's internal redraw.

**Rule:** use raw stdin directly for ALL input — setup wizard AND main REPL. Never mix readline terminal mode with direct stdout writes.

```ts
// ✓ correct — raw stdin, no readline
function askRaw(question: string): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write(question)
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    let input = ''
    const onKey = (_, key) => {
      if (key.name === 'return') { /* resolve */ }
      else if (key.name === 'backspace') { /* erase */ }
      else { input += key.sequence; process.stdout.write(key.sequence) }
    }
    process.stdin.on('keypress', onKey)
  })
}

// ✗ wrong — rl.close() kills stdin for later keypress listeners
const rl = readline.createInterface({ input: process.stdin, ... })
rl.question(..., resolve)
rl.close() // ← breaks everything after this
```

## Status messages

```
  ✓ Success message       ← green
  ✗ Error message         ← red
  ◆ tool: detail          ← gray (tool call)
    → result summary      ← gray / green for writes
```

## Setup wizard flow

```
  Welcome to Monkey Agent. Let's get you set up.

  Choose a provider:

    ❯ Anthropic
      OpenRouter
      Custom endpoint

  Get your API key: https://console.anthropic.com/

  API key: ▌

  Main model:

    ❯ claude-opus-4-5        — most capable
      claude-sonnet-4-5      — balanced
      claude-haiku-4-5       — fastest, cheapest

  Fast model (used for quick tasks):

    ❯ claude-haiku-4-5       — recommended
      claude-sonnet-4-5      — balanced

  ✓ Config saved to ~/.monkey-cli/config.json
```

## External API: authentication

Anthropic SDK 默认发 `x-api-key` header（Anthropic 自有格式）。

第三方 proxy 和 OpenRouter 遵循 OpenAI 标准，只认 `Authorization: Bearer {key}`。

**规则：有自定义 `base_url` 时，必须额外注入 Bearer 头：**

```ts
new Anthropic({
  apiKey: config.api_key,
  baseURL: config.base_url,
  defaultHeaders: { 'Authorization': `Bearer ${config.api_key}` },
})
```

Anthropic 官方端点不需要这个（SDK 默认行为已够用）。

## External API: model list

- User provides `base_url` as-is (e.g. `https://proxy.com`) — never ask them to append `/v1`
- We fetch models at `{base_url}/v1/models` with `Authorization: Bearer {api_key}`
- Response format: `{ data: [{ id: string }] }` (OpenAI-compatible standard)
- On failure: fall back to manual text input, don't crash

## Selector re-render

Move up N lines then clear to end of screen — not line-by-line:

```
\x1B[{N}A   ← move cursor up N lines
\x1B[0J     ← clear from cursor to end of screen
```

Where N = number of lines printed (blank + label + blank + items).
Line-by-line clearing causes flicker and residual artifacts.

## REPL prompt

```
❯ ▌          ← tame mode (default)
🐒 ❯ ▌       ← wild mode
```

- Orange bold `❯` with space
- No label, no indent — full width for input

## Permission system: tame / wild mode

Two global modes toggled by slash commands — no per-operation confirmation dialogs.

| Mode | Prompt | Behavior |
|------|--------|----------|
| tame (default) | `❯ ` | Dangerous commands blocked: `rm`, `rmdir`, force push, etc. AI is told the command was denied. |
| wild | `🐒 ❯ ` | All commands pass through. |

**Slash commands:** `/wild` to unlock, `/tame` to re-lock. Status shown in prompt.

**Dangerous command detection (tame mode):**
- `rm` / `rmdir` (any form)
- `git push --force` / `git push -f`
- `chmod` on system paths
- `kill` / `pkill`
- Pipe to `sh` / `bash` (e.g. `curl ... | bash`)

On block: return `Error: command blocked in tame mode. Switch to wild mode with /wild to allow.` — AI sees this and tells the user.

## REPL input: segment-based input model

The input state is represented as a list of **segments** rather than a flat string.
This decouples "what is displayed on screen" from "what text will be sent to the AI",
which is necessary for paste labels and wide-character backspace to work correctly.

```ts
type TypedSegment = { kind: 'typed'; text: string }
type PasteSegment = { kind: 'paste'; text: string; label: string }
type Segment = TypedSegment | PasteSegment
```

- `TypedSegment.text` — actual characters typed, echoed 1:1
- `PasteSegment.text` — actual pasted content (sent to AI)
- `PasteSegment.label` — short label shown on screen, e.g. `[pasted 42 chars]`
- `fullInput()` = `segments.map(s => s.text).join('')`

A fresh `TypedSegment` is always appended after each paste so that subsequent
typing always lands in a typed segment.

## REPL input: wide character backspace

Raw stdin backspace handler must account for wide characters (CJK, emoji = 2 columns)
**and** the segment model.

```ts
function charDisplayWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  // CJK unified, fullwidth, emoji ranges → 2 columns
  if (cp >= 0x4E00 && cp <= 0x9FFF /* etc. */) return 2
  return 1
}
```

Backspace algorithm (operates on `segments[]`):

1. While last segment is an empty `TypedSegment` and second-to-last is a `PasteSegment`:
   → erase the entire paste label (`label.length` columns) and remove both segments.
2. Otherwise if last typed segment has chars: remove last code point, erase its display width.
3. Never use `\x1B[1D` blindly — always use the actual display width.

```ts
// Erase N terminal columns and move cursor back:
process.stdout.write(`\x1B[${N}D${' '.repeat(N)}\x1B[${N}D`)
```

## REPL input: bracketed paste mode

Without bracketed paste, pasted text arrives as rapid keypress events. If paste contains
a newline, it triggers immediate send and the rest of the text is lost.

**Solution:** enable bracketed paste mode when entering raw input.

```
\x1B[?2004h   ← enable on stdin entry
\x1B[?2004l   ← disable on stdin exit
```

Terminal wraps paste content with:
```
\x1B[200~   ← paste start
...content...
\x1B[201~   ← paste end
```

**Behavior when paste detected:**
1. Buffer all content between `\x1B[200~` and `\x1B[201~` — do NOT echo
2. Strip `\r\n` → single space, trim
3. Push a `PasteSegment` + fresh empty `TypedSegment`
4. Print `[pasted N chars]` label inline (gray), then print a preview line below,
   then redraw the full prompt line so the cursor is correctly positioned

Display format:
```
❯ some typed text [pasted 42 chars]▌
  first 120 chars of pasted content…   ← preview line (gray)
❯ some typed text [pasted 42 chars]▌   ← prompt redrawn, cursor at end
```

The actual pasted content is in `PasteSegment.text` and is included in `fullInput()`
sent to the AI. The terminal only shows the short label — cursor tracking is exact
because backspace erases `label.length` columns atomically (not char by char).

## Banner

```
  [MONKEY big text colored by letter]

  the AI that evolves    v0.1.0  ● model-name    kaomoji
```

- 2-space left indent on ASCII art
- Info line: tagline (orange) + version (cream) + model dot (green) + model name (cream) + kaomoji (yellow)
