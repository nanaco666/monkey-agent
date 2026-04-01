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

### Implementation: never use readline for text input in setup

`readline.createInterface()` + `rl.close()` destroys the underlying stdin stream.
Any subsequent raw keypress listener (`process.stdin.on('keypress', ...)`) will stop receiving events.

**Rule:** use raw stdin directly for all input in setup wizard. One consistent approach end-to-end.

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
❯ ▌
```

- Orange bold `❯` with space
- No label, no indent — full width for input

## Banner

```
  [MONKEY big text colored by letter]

  the AI that evolves    v0.1.0  ● model-name    kaomoji
```

- 2-space left indent on ASCII art
- Info line: tagline (orange) + version (cream) + model dot (green) + model name (cream) + kaomoji (yellow)
