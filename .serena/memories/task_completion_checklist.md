# Task Completion Checklist

## Before Completing a Task

1. **Build Verification**
   - Run `pnpm build:extension` for extension changes
   - Run `pnpm build` for Next.js app changes
   - Ensure no TypeScript errors

2. **Code Quality**
   - Follow project code style
   - Add appropriate TypeScript types
   - Remove console.log statements (or comment them out)
   - No AI attribution in code

3. **Testing**
   - For critical changes, run `pnpm dev` briefly to verify
   - Test extension in Chrome if UI/functionality changed

4. **Git Operations**
   - Use conventional commit format: `type(scope): message`
   - No emojis in commit messages
   - No "Co-authored-by Claude" signatures
   - Stage relevant files only

5. **Documentation**
   - Update CLAUDE.md if workflow changes
   - Add inline comments for complex logic
   - Do not create new documentation files unless requested

## Build Commands
- Extension: `pnpm build:extension`
- Next.js: `pnpm build`
- Development test: `pnpm dev` (then cancel)
