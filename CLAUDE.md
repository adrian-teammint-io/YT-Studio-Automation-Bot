# CLAUDE.md


This file provides guidance to Claude Code () when working with code in this repository.

## TODOs

- [x] The "일시정지" button is automatically switched to "재개" button when the page reloads -> Persist in localStorage, doesn't change when page reloads.
- [x] Show the remaining number of campaigns not uploaded.
- [x] Default value of region (US, PH, ID, MY) buttons in each campaign item is not set -> Default value should be extracted from region extraction function, and this is the uploading folder (on Google Drive).
- [ ] No existing toast for notify the page is redirecting -> Create a toast notifying the page is redirecting "리디렉션 중..." with style "bottom: 184px" (in-place of the uploading status toast).
- [ ] When user clicks on "재개" button (or start the automation flow) -> navigates to the first item of the campaign list.
- [ ] The prev, next buttons is not handling properly (not following order) -> modify to make it follow the list's order.
- [ ] Add a button to check each campaign item's report file is uploaded.
- [ ] If there's no campaign to be uploaded, or all the campaigns are completed -> Pause the process.
- [ ] When navigates to a campaign, check if the campaign is uploaded (in localStorage). If not, then continue with the flow, else then continue with the next one.

## Project Overview

A Chrome extension built with Next.js 15.5, React 19, TypeScript, and Tailwind CSS 4. The extension provides a simple URL replacer popup that allows users to navigate the current tab to a new URL by entering it in an input field and clicking a button.

## Development Commands

### Development Server

```bash
npm run dev
```

Starts the Next.js development server with Turbopack (fast refresh enabled). Access at `http://localhost:3000`. Changes to `app/page.tsx` and other files will hot-reload automatically.

### Production Build

```bash
npm run build
```

Creates optimized production build with Turbopack bundler.

### Production Server

```bash
npm start
```

Serves the production build (must run `npm run build` first).

## Architecture & Structure

### App Router (Next.js 15)

- **App Directory Pattern**: Uses Next.js App Router (`app/` directory), not Pages Router
- **Server Components by Default**: All components are React Server Components unless marked with `"use client"`
- **File-based Routing**: Routes defined by folder structure in `app/`
  - `app/layout.tsx` - Root layout with font configuration and metadata
  - `app/page.tsx` - Homepage route (`/`)
  - `app/globals.css` - Global styles with Tailwind imports

### Styling System

- **Tailwind CSS 4**: Uses new `@import "tailwindcss"` syntax in `globals.css`
- **Theme Inline**: Custom theme variables defined with `@theme inline` directive
- **CSS Variables**: Design tokens in `:root` for `--background`, `--foreground`
- **Dark Mode**: Automatic dark mode via `prefers-color-scheme` media query
- **Geist Fonts**: Custom font configuration (Geist Sans & Geist Mono) loaded via `next/font/google`

### TypeScript Configuration

- **Path Aliases**: `@/*` maps to project root (e.g., `@/app/page.tsx`)
- **Strict Mode**: TypeScript strict checking enabled
- **Module Resolution**: Uses `bundler` strategy (Next.js optimized)
- **Target**: ES2017 compilation target

### Turbopack Build System

- **Default Bundler**: Both dev and build use `--turbopack` flag
- **Fast Refresh**: Near-instant updates during development
- **No Webpack**: Turbopack replaces webpack entirely

## Development Guidelines

### Component Patterns

- Start all client components with `"use client"` directive
- Server components should not use hooks, event handlers, or browser APIs
- Use async/await in Server Components for data fetching
- Leverage Next.js image optimization via `next/image` component

### Routing Conventions

- Create new routes by adding folders in `app/` directory
- Use `page.tsx` for route content, `layout.tsx` for shared layouts
- Loading states: `loading.tsx`, Error boundaries: `error.tsx`
- API routes go in `app/api/[route]/route.ts`

### Styling Best Practices

- Prefer Tailwind utility classes over custom CSS
- Use CSS variables for theme values (defined in `globals.css`)
- Font classes auto-generated: `font-sans`, `font-mono`
- Maintain dark mode compatibility with all new styles

### Type Safety

- All files should use `.tsx` extension for components
- Leverage TypeScript's strict mode - no implicit any
- Use Next.js type exports (`Metadata`, `NextConfig`, etc.)
- Define proper prop types for all components
