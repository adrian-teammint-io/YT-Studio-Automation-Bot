# Project Overview

## Purpose
YouTube Studio Analytics Automation Bot - A Chrome extension that automates data collection from YouTube Studio Analytics.

## Tech Stack
- **Framework**: Next.js 15.5, React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **Build Tools**: Webpack 5, Turbopack
- **Extension**: Chrome Extension with content scripts

## Key Features
- Automated tooltip data collection from line graphs
- Date range selection and filtering
- Data extraction at specific timestamps (12:10 AM)
- Traffic source analytics
- TSV export to clipboard

## Project Structure
- `extension/` - Chrome extension source code
  - `yt-analytics-content.ts` - Main content script for data collection
  - `popup.tsx` - Extension popup UI
  - `components/` - React components
- `app/` - Next.js application
- `dist/` - Built extension files
