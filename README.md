# GMV 맥스 자동화 봇

A Chrome extension for automating TikTok campaign report uploads to Google Drive.

## Features

- **Campaign Management**: Organize campaigns by region and priority
- **Auto Upload**: Automatically upload campaign reports to Google Drive
- **Region Detection**: Automatically detect campaign regions (US, PH, ID, MY)
- **Service Account Auth**: No user authentication required
- **Modern UI**: Built with React and Tailwind CSS

## Tech Stack

- **React 19** with TypeScript
- **Tailwind CSS 4** for styling
- **Chrome Extension APIs** for automation
- **Google Drive API** for file uploads
- **Service Account Authentication**

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google Chrome browser
- Google Cloud service account credentials

### Installation

1. Clone the repository and install dependencies:
```bash
git clone https://github.com/thanhhoan-v2/chrome-gmv-max-automation.git
cd chrome-gmv-max-automation
npm install
```

2. Configure service account credentials in `extension/config/service-account.ts`

3. Build and load the extension:
```bash
npm run build:extension
```
Then load the `dist/` folder in Chrome extensions (Developer mode required)

## Project Structure

```
├── extension/          # Chrome extension source
│   ├── popup.tsx      # Main popup UI
│   ├── background.ts  # Background automation script
│   ├── content.ts     # Content script for TikTok pages
│   ├── services/      # Google Drive API integration
│   ├── components/   # React components
│   └── config/       # Service account credentials
├── components/ui/     # UI components
├── dist/             # Built extension
└── public/           # Extension assets
```

## Development

```bash
npm run dev:extension  # Watch mode for extension development
npm run build:extension # Build for production
```

## License

MIT
