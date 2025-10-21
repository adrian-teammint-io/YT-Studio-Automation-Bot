# Chrome Extension Todo App

A modern todo application with drag-and-drop functionality, built as a Chrome extension using Next.js 15, React 19, and Shadcn UI.

## Features

- 🎯 **Dual Sections**: Organize tasks into "All" and "Done" sections
- 🔄 **Drag & Drop**: Reorder tasks and move between sections seamlessly
- 🎨 **Dark Theme**: Beautiful dark mode with OKLCH color space
- 💾 **Local Storage**: Tasks persist using Chrome's local storage
- 📱 **Responsive**: Clean, modern UI with Shadcn components

## Tech Stack

- **Next.js 15.5** with App Router and Turbopack
- **React 19** with TypeScript
- **Tailwind CSS 4** for styling
- **@dnd-kit** for drag-and-drop
- **Shadcn UI** components
- **Webpack 5** for extension bundling

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google Chrome browser

### Installation

1. Clone the repository:
```bash
git clone https://github.com/thanhhoan-v2/chrome-gmv-max-automation.git
cd chrome-gmv-max-automation
```

2. Install dependencies:
```bash
npm install
```

3. Build the Chrome extension:
```bash
npm run build:extension
```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` folder from this project

### Development

**For extension development:**
```bash
npm run dev:extension  # Watch mode for extension
```

**For Next.js web app:**
```bash
npm run dev  # Next.js dev server on http://localhost:3000
```

## Project Structure

```
├── extension/          # Chrome extension source
│   ├── popup.tsx      # Main popup UI component
│   ├── popup.html     # Extension popup HTML
│   ├── index.tsx      # Extension entry point
│   └── background.ts  # Background script
├── components/ui/     # Shadcn UI components
├── app/              # Next.js app (optional web version)
├── dist/             # Built extension (generated)
├── public/           # Extension assets (icons, manifest)
└── webpack.config.js # Extension build config
```

## Key Directories

- **`extension/`** - Focus here for extension development
- **`components/ui/`** - Reusable UI components
- **`dist/`** - Built extension for Chrome (git-ignored)

## Building for Production

```bash
npm run build:extension
```

The built extension will be in the `dist/` folder, ready to be loaded in Chrome or packaged for distribution.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes in the `extension/` directory
4. Build and test the extension (`npm run build:extension`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build Next.js app |
| `npm run dev:extension` | Watch mode for extension |
| `npm run build:extension` | Build extension for production |

## License

MIT
