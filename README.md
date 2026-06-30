# 🐒 Monkey Agent

> The AI that evolves.

A terminal-based AI coding assistant powered by Claude. Smart, social (multi-agent coming), and always evolving.

```
  ███╗   ███╗ ██████╗ ███╗   ██╗██╗  ██╗███████╗██╗   ██╗
  ████╗ ████║██╔═══██╗████╗  ██║██║ ██╔╝██╔════╝╚██╗ ██╔╝
  ██╔████╔██║██║   ██║██╔██╗ ██║█████╔╝ █████╗   ╚████╔╝
  ██║╚██╔╝██║██║   ██║██║╚██╗██║██╔═██╗ ██╔══╝    ╚██╔╝
  ██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║  ██╗███████╗   ██║
  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝
```

## Features

- **Reads & writes code** — file operations, bash commands, search
- **Agentic loop** — keeps calling tools until the task is done
- **Prompt cache** — reuses system prompt cache, saves ~80% input token cost
- **Slash commands** — `/clear`, `/help`, `/model`
- **Streaming output** — see responses as they arrive

## Requirements

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com/)

## Installation

```bash
git clone https://github.com/nanaco666/monkey-agent.git
cd monkey-agent
npm install
npm run build
npm install -g .
```

## Setup

Set your API key (one-time):

```bash
monkey config set api_key <your-key>
```

Or use an environment variable:

```bash
export MONKEY_API_KEY=<your-key>
```

The key is saved to `~/.monkey-cli/config.json`.

### Custom endpoint

Monkey works with any Anthropic-compatible API. Set a custom `base_url` to use OpenRouter, a local proxy, or other providers:

```bash
monkey config set base_url https://openrouter.ai/api/v1
monkey config set api_key <openrouter-key>
monkey config set model anthropic/claude-opus-4-6
```

## Usage

```bash
monkey
```

## Commands

| Input | Action |
|-------|--------|
| Any text | Send message to Claude |
| `/clear` | Clear conversation history |
| `/model` | Show current model |
| `/help` | Show help |
| `Ctrl+C` | Interrupt response |
| `Ctrl+C` × 2 | Exit |

## Tools

Monkey has access to these tools:

| Tool | What it does |
|------|-------------|
| `bash` | Execute shell commands |
| `read` | Read file contents |
| `write` | Write/create files |
| `edit` | Precise string replacement in files |
| `glob` | Find files by pattern |
| `grep` | Search content in files |

## Configuration

`~/.monkey-cli/config.json`:

```json
{
  "api_key": "your-api-key",
  "base_url": "https://api.anthropic.com",
  "model": "claude-opus-4-6",
  "fast_model": "claude-sonnet-4-6",
  "assistant_name": "Monkey"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `api_key` | — | API key (required) |
| `base_url` | Anthropic default | Custom endpoint for OpenRouter, proxies, etc. |
| `model` | `claude-opus-4-6` | Model for main conversations |
| `fast_model` | `claude-sonnet-4-6` | Model for lightweight tasks |
| `assistant_name` | `Monkey` | Name your assistant calls itself |

Environment variables: `MONKEY_API_KEY`, `ANTHROPIC_API_KEY` (fallback).

## Privacy & Data

Monkey keeps all your data **locally on your machine**. Nothing is sent anywhere except to your configured LLM provider.

- **Config & keys**: `~/.monkey-cli/config.json` — contains your API key in plaintext. Protect it.
- **Memory**: `~/.monkey-cli/memory/<project>/` — persistent notes Monkey saves across sessions.
- **Session logs**: `~/.monkey-cli/memory/<project>/sessions/` — conversation history.

No telemetry, no analytics, no phone-home. The open-source repo is a blank canvas — zero personal data.

## Telegram Bot

Run Monkey as a Telegram bot (for personal always-on access):

```bash
monkey config set telegram_bot_token <your-bot-token>
monkey config set telegram_allowed_users 123456789
monkey telegram
```

| Field | Description |
|-------|-------------|
| `telegram_bot_token` | Bot token from @BotFather |
| `telegram_allowed_users` | Telegram user IDs allowed to chat (JSON array) |

## Roadmap

- [x] Core agentic loop
- [x] File & bash tools
- [x] Prompt cache optimization
- [x] Memory — persists knowledge across sessions
- [x] Telegram bot mode
- [x] Web search & fetch tools
- [x] OCR image recognition (Telegram)
- [ ] Permission system (confirm before destructive actions)
- [ ] Dream — background memory consolidation
- [ ] Multi-agent coordinator (the "social" part)
- [ ] Web UI

## License

MIT
