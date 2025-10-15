# Refactor Plan - popup.tsx Component Splitting

**Session Start:** 2025-10-07
**Target:** extension/popup.tsx (790 lines)
**Goal:** Split into smaller, maintainable components following DRY and KISS

## Initial State Analysis

**Current Architecture:**
- Single file with 790 lines containing:
  - Type definitions (Priority, Todo)
  - Configuration objects (priorityConfig)
  - Utility functions (sortTodosByPriority, getRelativeDate, formatFullDate)
  - 4 components (SortableTodoItem, DroppableSection, TodoPopup, plus export view)
  - Complex state management with 7+ state variables
  - Chrome storage integration
  - Command mode system
  - Drag-and-drop functionality

**Problem Areas:**
1. **Monolithic Main Component** - TodoPopup (458 lines) handles too many concerns
2. **Code Duplication** - Markdown generation logic duplicated
3. **Mixed Concerns** - Storage, UI, state, commands all in one file
4. **Testing Difficulty** - Hard to test individual pieces
5. **Low Reusability** - Utility functions locked in component file

**Dependencies:**
- External: @dnd-kit/core, @dnd-kit/sortable, lucide-react, streamdown
- Internal: UI components from @/components/ui/*
- Chrome APIs: chrome.storage, chrome.tabs, chrome.scripting

**Test Coverage:** Unknown (no tests currently)

## Refactoring Tasks

### Phase 1: Extract Types and Constants (Low Risk) ✓
**Files to create:**
- `extension/types/todo.ts` - Todo, Priority type definitions
- `extension/constants/priority.ts` - priorityConfig, availableCommands

**Rationale:** Zero logic, pure definitions, safest extraction

### Phase 2: Extract Utility Functions (Low Risk) ✓
**Files to create:**
- `extension/utils/todo-sort.ts` - sortTodosByPriority
- `extension/utils/date-format.ts` - getRelativeDate, formatFullDate
- `extension/utils/markdown.ts` - generateMarkdown

**Rationale:** Pure functions, easily testable, no dependencies

### Phase 3: Extract Storage Logic (Medium Risk) ✓
**Files to create:**
- `extension/hooks/useTodoStorage.ts` - Custom hook for Chrome storage
  - loadTodos()
  - saveTodos(todos)
  - Migration logic

**Rationale:** Isolates Chrome API, testable with mocks, reusable

### Phase 4: Extract UI Components (Medium Risk) ✓
**Files to create:**
- `extension/components/TodoHeader.tsx` - Header with date, count, buttons
- `extension/components/TodoInput.tsx` - Input with command mode
- `extension/components/CommandPalette.tsx` - Command dropdown
- `extension/components/ExportView.tsx` - Markdown export view
- `extension/components/DividerSection.tsx` - ChevronDown divider

**Rationale:** Each handles single UI concern, improves readability

### Phase 5: Extract Hook Logic (Medium Risk) ✓
**Files to create:**
- `extension/hooks/useCommandMode.ts` - Command mode state + keyboard handling
- `extension/hooks/useUrlPaste.ts` - GitHub PR URL extraction
- `extension/hooks/useTodoOperations.ts` - toggle, delete, edit, changePriority

**Rationale:** Separates behavior from UI, testable, reusable

### Phase 6: Refactor Main Component (High Risk) ✓
**Changes:**
- Slim down TodoPopup to orchestration only
- Use extracted hooks and components
- Maintain all functionality
- Ensure drag-and-drop still works

**Rationale:** Final integration, maintains API surface

## Validation Checklist
- [x] All old patterns removed
- [x] No broken imports
- [x] All tests passing (N/A - no tests yet)
- [x] Build successful
- [x] Type checking clean
- [x] No orphaned code
- [x] Documentation updated (CLAUDE.md preserved)

## De-Para Mapping

| Before | After | Status |
|--------|-------|--------|
| popup.tsx (types) | types/todo.ts | ✓ Complete |
| popup.tsx (constants) | constants/priority.ts | ✓ Complete |
| popup.tsx (sort/date utils) | utils/todo-sort.ts, date-format.ts | ✓ Complete |
| popup.tsx (markdown gen) | utils/markdown.ts | ✓ Complete |
| popup.tsx (storage logic) | hooks/useTodoStorage.ts | ✓ Complete |
| popup.tsx (header UI) | components/TodoHeader.tsx | ✓ Complete |
| popup.tsx (input UI) | components/TodoInput.tsx | ✓ Complete |
| popup.tsx (command UI) | components/CommandPalette.tsx | ✓ Complete |
| popup.tsx (export UI) | components/ExportView.tsx | ✓ Complete |
| popup.tsx (command logic) | hooks/useCommandMode.ts | ✓ Complete |
| popup.tsx (URL paste) | hooks/useUrlPaste.ts | ✓ Complete |
| popup.tsx (operations) | hooks/useTodoOperations.ts | ✓ Complete |
| popup.tsx (main) | popup.tsx (slimmed) | ✓ Complete |

## New Directory Structure

```
extension/
├── popup.tsx (main - orchestration only ~200 lines)
├── types/
│   └── todo.ts
├── constants/
│   └── priority.ts
├── utils/
│   ├── todo-sort.ts
│   ├── date-format.ts
│   └── markdown.ts
├── hooks/
│   ├── useTodoStorage.ts
│   ├── useCommandMode.ts
│   ├── useUrlPaste.ts
│   └── useTodoOperations.ts
└── components/
    ├── TodoHeader.tsx
    ├── TodoInput.tsx
    ├── CommandPalette.tsx
    ├── ExportView.tsx
    └── DividerSection.tsx
```

## Risk Assessment

**Low Risk:** Phases 1-2 (types, constants, pure utils)
**Medium Risk:** Phases 3-5 (hooks, UI components)
**High Risk:** Phase 6 (main refactor)

**Mitigation:**
- Test after each phase
- Maintain git checkpoints
- Keep original file until final validation
- Verify build and type checking continuously

## Rollback Strategy

If issues arise:
1. Git revert to last checkpoint
2. Fix identified issue
3. Re-apply changes incrementally
4. Validate again

## Expected Benefits

**Metrics:**
- Main file: 790 → ~200 lines (75% reduction)
- Components: 1 → 13 files
- Testability: 0% → 80% (utils, hooks testable)
- Reusability: Low → High
- Maintainability: Poor → Good

**Team Impact:**
- Easier to find and modify specific logic
- Better parallel development (less merge conflicts)
- Clearer separation of concerns
- Improved onboarding for new developers
