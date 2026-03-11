# YouTube Markdown Extension

A Chrome extension that saves YouTube videos, transcribes them, generates AI summaries, and exports to multiple destinations as markdown.

## Features

- **Save Videos** - Save YouTube videos and playlists to a local library
- **Transcribe** - Extract captions/subtitles from YouTube videos
- **AI Summaries** - Use Claude API to generate summaries, study notes, skills files, and blog drafts
- **Export** - Export markdown to:
  - Clipboard (copy/paste anywhere)
  - Local file download
  - Obsidian vault (direct file write)
  - Google Drive (OAuth2 upload)
- **Dashboard** - Feature-rich popup with library, search, tags, and playlist management
- **Templates** - Multiple markdown templates (video note, skills file, study notes, blog draft)
- **Context Menu** - Right-click any YouTube link to save it

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `youtube-markdown-extension` directory
5. The extension icon will appear in your toolbar

## Setup

1. Click the extension icon and go to **Settings** (gear icon)
2. Enter your **Claude API key** for AI features (from [console.anthropic.com](https://console.anthropic.com))
3. Configure default export destinations

## Usage

1. Navigate to any YouTube video
2. Click the **Save** button (floating action button) or use the extension popup
3. Click **Transcribe** to extract the video's captions
4. Click **AI Summary** to generate a summary using Claude
5. Go to the **Export** tab to choose a template and export destination

## Templates

| Template | Description |
|----------|-------------|
| Video Note | Standard note with metadata, summary, and transcript |
| Skills File | Structured learning document with objectives and exercises |
| Study Notes | Key takeaways, flashcard Q&A pairs, action items |
| Blog Draft | Blog post outline generated from video content |

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES modules)
- IndexedDB for local storage
- Claude API for AI features
- Google Drive API for cloud export
- File System Access API for Obsidian integration
