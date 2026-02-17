<h1><img src="addon/content/icons/favicon.svg" width="32" height="32" style="vertical-align: middle;"> Zota</h1>

[![Zotero](https://img.shields.io/badge/Zotero-7+-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org) [![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template) [![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0)

**Chat with AI about your PDF documents in Zotero.**

[English](README.md) | [简体中文](doc/README-zhCN.md)

## Screenshots

|               Sidebar Window               |              Float Window              |
| :----------------------------------------: | :------------------------------------: |
| ![sidebar](doc/screenshots/sidebar_en.png) | ![float](doc/screenshots/float_en.png) |

## Features

### Version 0.0.5 (2026-02-17)

- **Multi built-in providers support**: Now can switch between different AI providers (e.g., OpenAI, Claude, Google Gemini) to get responses, and can take your own OpenAI-Compatible API endpoint.

### Version 0.0.4 (2026-02-08)

- The main branch is now **compatible with Zotero 7+**, former Zotero 7 version in branch [zotero7](https://github.com/merc-hecl/zota/tree/zotero7).
- **Add image upload support**: Now can upload images **from clipboard** or **drag-and-drop** into the chat panel to chat about images with the AI model that supports image input.
  ![image-upload](doc/screenshots/upload_image_en.png)
- Add ~~**multi-endpoint** and~~ **multi-apikey** support: Now can configure multiple API endpoints and keys(and can set a nickname for each api key) to switch between different providers.
  ![multi-endpoint](doc/screenshots/multiendpoint_en.png) ![multi-apikey](doc/screenshots/multiapikey_en.png)

- **Float window**: Now the size and position of the float window should be remembered after closing.

- **Bug**: the pin button in the float window is not working in Zotero 8.

- see [Release Notes](https://github.com/merc-hecl/zota/releases/tag/V0.0.4) for more details.

### Version 0.0.1 ~ 0.0.3 (2026-02-05)

- ~~**No vendor lock-in**: Bring your own OpenAI-Compatible API endpoint~~
- **PDF Context**: Attach PDF content or select specific paragraphs for context-aware responses
- **Streaming**: Real-time response streaming
- **History**: Per-document conversation history
- **Markdown**: Full markdown with syntax rendering

## Installation

1. Download `.xpi` from [Releases](https://github.com/merc-hecl/zota/releases)
2. Zotero → `Tools` → `Add-ons` → ⚙️ → `Install Add-on From File...`

## Quick Start

1. Open a PDF in Zotero
2. Click the chat icon in toolbar
3. Check "Attach PDF" or select specific paragraphs to include document context
4. Start chatting in the sidebar panel or float window

## Configuration

Go to `Settings` → `Zota` to:

- Set OpenAI-compatible API endpoint (e.g., https://api.openai.com/v1)
- Set API key and select model (e.g., gpt-4o)
- Adjust max tokens, temperature, max PDF content length, system prompt

## License

[AGPL-3.0](LICENSE)

## Acknowledgments

- [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) - This project used the Zotero Plugin Template.
- [paper-chat-for-zotero](https://github.com/syt2/paper-chat-for-zotero) - This project was forked from paper-chat-for-zotero.
- [Kimi-K2.5](https://github.com/MoonshotAI/Kimi-K2.5) - This project was entirely developed using the Kimi-k2.5 model.
- [lucide](https://github.com/lucide-icons/lucide) - The icon used in this project is from lucide.
