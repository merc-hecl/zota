<h1><img src="../addon/content/icons/favicon.svg" width="32" height="32" style="vertical-align: middle;"> Zota</h1>

[![Zotero](https://img.shields.io/badge/Zotero-7+-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org) [![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template) [![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0)

**在 Zotero 中直接与 AI 讨论 PDF 文档。**

[English](../README.md) | [简体中文](README-zhCN.md)

## 截图

|              边栏窗口               |             浮动窗口              |
| :---------------------------------: | :-------------------------------: |
| ![边栏](screenshots/sidebar_zh.png) | ![浮动](screenshots/float_zh.png) |

## 特性

### 版本 0.0.5 (2026-02-17)

- **多内置供应商支持**：现在可以在不同的 AI 提供商之间切换，例如 OpenAI、Claude、Google Gemini。也可以使用自己的 OpenAI-Compatible API 端点。

### 版本 0.0.4 (2026-02-08)

- 主分支现在 **兼容 Zotero 7+**，之前的 Zotero 7 版本代码在分支 [zotero7](https://github.com/merc-hecl/zota/tree/zotero7) 中。

- 支持图片上传功能：现在可以从**剪贴板**或**拖拽图片**到聊天面板与支持图片输入的 AI 模型进行讨论。
  ![image-upload](screenshots/upload_image_zh.png)

- 支持 ~~**多供应商**和~~ **多 API Key**：现在可以配置多个 API 端点和密钥（每个密钥可以设置一个昵称），可以在不同供应商之间切换。
  ![multi-endpoint](screenshots/multiendpoint_zh.png) ![multi-apikey](screenshots/multiapikey_zh.png)

- **浮动窗口**: 现在浮动窗口的大小和位置在关闭后应该会被记住。
- **Bug**: 浮动窗口中的置顶按钮在 Zotero 8 中不起作用。

- 更多详情请查看 [发布说明](https://github.com/merc-hecl/zota/releases/tag/V0.0.4)

### 版本 0.0.1 ~ 0.0.3 (2026-02-05)

- ~~**无供应商锁定**: 使用你自己的 OpenAI-Compatible API 端点~~
- **PDF 上下文**: 附加 PDF 内容或者划选段落获得上下文感知回复
- **流式输出**: 实时响应流
- **历史记录**: 每个文档独立的对话历史
- **Markdown**: 完整 Markdown 支持

## 安装

1. 从 [Releases](https://github.com/merc-hecl/zota/releases) 下载 `.xpi` 文件
2. Zotero → `工具` → `附加组件` → ⚙️ → `从文件安装附加组件...`

## 快速开始

1. 在 Zotero 中打开 PDF
2. 点击工具栏中的聊天图标
3. 勾选"附加 PDF"或选择特定段落以包含文档上下文
4. 开始在边栏面板或浮动窗口中聊天

## 配置

进入 `设置` → `Zota`：

- 设置 OpenAI-Compatible API 端点（例如 `https://api.openai.com/v1`）
- 输入 API Key 并选择模型
- 调整最大 Token 数、温度、最大上传 PDF 字符数、系统提示词

## 许可证

[AGPL-3.0](../LICENSE)

## 致谢

- [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) - 本项目使用了 Zotero Plugin Template。
- [paper-chat-for-zotero](https://github.com/syt2/paper-chat-for-zotero) - 本项目是 paper-chat-for-zotero 的一个分支。
- [Kimi-K2.5](https://github.com/MoonshotAI/Kimi-K2.5) - 本项目完全使用 Kimi-K2.5 模型进行开发。
- [lucide](https://lucide.dev) - 本项目使用了 lucide 图标库。
- [ai-research-assistant](https://github.com/lifan0127/ai-research-assistant) - 本项目的一些功能受到了 ai-research-assistant 的启发。
