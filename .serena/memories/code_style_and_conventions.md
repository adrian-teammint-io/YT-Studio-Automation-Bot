# Code Style and Conventions

## TypeScript
- Strict mode enabled
- Use explicit type annotations
- Prefer interfaces for objects
- Use async/await for asynchronous operations

## React Patterns
- Server Components by default (Next.js App Router)
- Use `"use client"` directive for client components
- Functional components with hooks
- Props with TypeScript interfaces

## Naming Conventions
- Files: kebab-case for general files, PascalCase for React components
- Components: PascalCase
- Variables/functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Interfaces: PascalCase with "I" prefix optional

## Code Organization
- Group related functionality together
- Use barrel exports (index.ts) for modules
- Keep components small and focused
- Extract shared logic into hooks or utilities

## Comments
- Use JSDoc style for functions
- Inline comments for complex logic
- Korean language comments for user-facing messages
