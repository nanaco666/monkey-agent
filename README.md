<div align="center">

# 🐒 Monkey

**The AI that evolves.**

A terminal-first AI coding assistant with persistent memory, self-learning, and a personality.

`⊂((✧▽✧))⊃`

</div>

---

```
  ███╗   ███╗ ██████╗ ███╗   ██╗██╗  ██╗███████╗██╗   ██╗
  ████╗ ████║██╔═══██╗████╗  ██║██║ ██╔╝██╔════╝╚██╗ ██╔╝
  ██╔████╔██║██║   ██║██╔██╗ ██║█████╔╝ █████╗   ╚████╔╝
  ██║╚██╔╝██║██║   ██║██║╚██╗██║██╔═██╗ ██╔══╝    ╚██╔╝
  ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║  ██╗███████╗   ██║
  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝
```

## ✨ Highlights

- **Persistent memory** — remembers your preferences, project context, and feedback across sessions
- **Self-learning** — extracts knowledge before compacting conversations, so nothing important is lost
- **Self-cleaning** — automatically prunes stale sessions; `/clean` triggers full memory cleanup with knowledge rescue
- **On-demand tool loading** — only sends relevant tool definitions, saving ~600 tokens per turn
- **Web access** — search DuckDuckGo, fetch any URL, read docs and APIs in-context
- **macOS integrations** — read/write Apple Notes and Reminders via built-in tools
- **Telegram bot** — always-on access from your phone with OCR image support
- **Multi-provider** — Anthropic, OpenAI, OpenRouter, or any compatible endpoint
- **Kaomoji mood** — `⊂((・▽・))⊃` because terminals deserve personality

## 🚀 Install

```bash
git clone https://github.com/nanaco666/monkey-agent.git
cd monkey-agent
npm install
npm run build
npm install -g .
```

**Requirements:** Node.js 20+, an [Anthropic API key](https://console.anthropic.com/)

## ⚙️ Setup

```bash
monkey config set api_key <your-key>
```

Or use environment variables: `MONKEY_API_KEY`, `ANTHROPIC_API_KEY` (fallback).

Keys are saved to `~/.monkey-cli/config.json`.

### Custom endpoints

Works with any Anthropic/OpenAI-compatible API:

```bash
monkey config set base_url https://openrouter.ai/api/v1
monkey config set api_key <openrouter-key>
monkey config set model anthropic/claude-opus-4-6
```

## 🖥️ Usage

```bash
monkey
```

You'll see:

```
  ◆ memory  context loaded
  ◆ cleaned 2 old sessions (48KB)

❯ tell me about this project
 ⊂((・▽・))⊃
```

The orange `❯` prompt is your input. Monkey streams responses in real-time.

### Wild mode

By default, dangerous commands require confirmation. Unlock everything with `/wild`:

```
❯ /wild
  🐒 wild mode — all commands allowed
```

## ⌨️ Commands

| Command | Description |
|---------|-------------|
| `/commit [context]` | Generate a git commit message |
| `/plan [topic]` | Read-only planning mode |
| `/memory` | View and manage persistent memory |
| `/clean` | Prune stale sessions & redundant memory |
| `/model [name]` | Show or switch model (aliases: opus, sonnet, haiku) |
| `/usage` | Show token usage & estimated cost |
| `/update` | Pull latest, rebuild, restart bot |
| `/wild` | Unlock dangerous commands 🐒 |
| `/tame` | Re-enable safety mode |
| `/clear` | Clear conversation history |
| `/help` | Show help |

**Keyboard:** `Ctrl+C` interrupts response, `Ctrl+C` × 2 exits.

## 🛠️ Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read file contents |
| `write` | Write/create files |
| `edit` | Precise string replacement in files |
| `glob` | Find files by pattern |
| `grep` | Search content in files |
| `memory_write` | Save persistent knowledge |
| `notes` | Read/write Apple Notes (macOS) |
| `reminders` | Manage Apple Reminders (macOS) |
| `web_search` | Search the web via DuckDuckGo |
| `web_fetch` | Fetch any URL (pages, APIs, docs) |

Core tools are always loaded. Optional tools (notes, reminders, web) are loaded on-demand when your message mentions them, then stay active for the rest of the conversation.

## 🧠 Memory & Self-Learning

Monkey remembers things across sessions. It stores knowledge in `~/.monkey-cli/memory/<project>/`:

- **User preferences** — "I hate broccoli", "use concise responses"
- **Project context** — architecture decisions, tool locations, patterns
- **Feedback** — corrections and behavioral rules
- **References** — external links, IDs, credentials hints

### How it learns

1. **Auto-extraction** — Before compacting a long conversation, Monkey uses the fast model to extract knowledge worth saving. This happens automatically at `~80K` input tokens.
2. **Manual** — `/memory` to view, or just tell Monkey to remember something.
3. **Knowledge rescue** — When `/clean` deletes redundant memory files, it first extracts any still-valuable knowledge not covered by remaining files.

### How it cleans

- **On startup** — automatically deletes session logs older than 30 days
- **`/clean`** — full cleanup: stale sessions + LLM-reviewed memory deduplication
- **Safety guard** — all deletions are restricted to `~/.monkey-cli/` only (path validation + traversal protection)

## 📱 Telegram Bot

Run Monkey as an always-on Telegram bot:

```bash
monkey config set telegram_bot_token <your-bot-token>
monkey config set telegram_allowed_users '["123456789"]'
monkey telegram
```

Supports text, images (with OCR), and all slash commands. Only allowed users can interact with the bot.

## 🔧 Configuration

`~/.monkey-cli/config.json`:

```json
{
  "api_key": "your-api-key",
  "base_url": "https://api.anthropic.com",
  "model": "claude-opus-4-6",
  "fast_model": "claude-sonnet-4-6",
  "assistant_name": "Monkey",
  "telegram_bot_token": "...",
  "telegram_allowed_users": ["123456789"]
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `api_key` | — | API key (required) |
| `base_url` | Provider default | Custom endpoint |
| `model` | `claude-opus-4-6` | Model for main conversations |
| `fast_model` | `claude-sonnet-4-6` | Model for lightweight tasks (cleanup, extraction) |
| `assistant_name` | `Monkey` | Name your assistant calls itself |

## 🔒 Privacy & Data

All data stays **locally on your machine**. Nothing is sent anywhere except to your configured LLM provider.

| What | Where | Notes |
|------|-------|-------|
| Config & keys | `~/.monkey-cli/config.json` | API key in plaintext — protect it |
| Memory | `~/.monkey-cli/memory/<project>/` | Persistent notes across sessions |
| Session logs | `~/.monkey-cli/memory/<project>/sessions/` | Auto-pruned after 30 days |
| Crash logs | `~/.monkey-cli/crash.log` | Local only |

No telemetry, no analytics, no phone-home. The open-source repo is a blank canvas — zero personal data.

## 🗺️ Roadmap

- [x] Core agentic loop with streaming
- [x] File & bash tools
- [x] Prompt cache optimization
- [x] Persistent memory across sessions
- [x] Telegram bot mode
- [x] Web search & fetch
- [x] OCR image recognition (Telegram)
- [x] Self-learning (knowledge extraction before compact)
- [x] Self-cleaning with knowledge rescue & safe delete guard
- [x] On-demand tool loading (context trimming)
- [x] Kaomoji mood system
- [ ] Permission system (confirm before destructive actions)
- [ ] Dream — background memory consolidation
- [ ] Multi-agent coordinator
- [ ] Web UI

## License

MIT
