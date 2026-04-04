# Quick Filter v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the toolbar quick filter system with mutual exclusion between Status/Team/Priority modes, sub-filters inside Team and Priority dropdowns, and expand/collapse all buttons.

**Architecture:** Quick filter state is managed in `page.tsx` via a new `activeQuickFilter` discriminator and per-mode sub-filter state objects. Each mode owns its own filter values that get mapped to `RoadmapTreeFilters` only when that mode is active. The existing `ToolbarQuickFilter.tsx` is replaced by three specialized components: `QuickFilterStatus`, `QuickFilterTeam`, `QuickFilterPriority`. Expand/Collapse all is two simple toolbar buttons that manipulate `expandedIds`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, React Portal (for dropdowns)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/quickFilter.ts` | CREATE | Type definitions for quick filter state |
| `src/components/QuickFilterStatus.tsx` | CREATE | Status-only dropdown (presets + full list) |
| `src/components/QuickFilterTeam.tsx` | CREATE | Team dropdown with status sub-filter |
| `src/components/QuickFilterPriority.tsx` | CREATE | Priority dropdown with team sub-filter |
| `src/components/QuickFilterButton.tsx` | CREATE | Shared button wrapper (active/disabled styling) |
| `src/components/QuickFilterDropdown.tsx` | CREATE | Shared portal dropdown shell (positioning, close-on-outside) |
| `src/components/Toolbar.tsx` | MODIFY | Replace ToolbarQuickFilter instances with new components + expand/collapse buttons |
| `src/app/roadmap/[id]/page.tsx` | MODIFY | Add `activeQuickFilter` state, per-mode sub-filter state, expand/collapse handlers, map active filter to `RoadmapTreeFilters` |
| `src/components/ToolbarQuickFilter.tsx` | DELETE | Replaced by new components |

---

### Task 1: Type Definitions

**Files:**
- Create: `src/types/quickFilter.ts`

- [ ] **Step 1: Create the type file**

```typescript
// src/types/quickFilter.ts

import type { ItemStatus } from './roadmap';

/** Which quick filter mode is currently active (only one at a time) */
export type QuickFilterMode = 'status' | 'team' | 'priority' | null;

/** State for the Status quick filter */
export interface QuickFilterStatusState {
    /** Selected status values (OR within group) */
    statuses: string[];
}

/** State for the Team quick filter (team + status sub-filter) */
export interface QuickFilterTeamState {
    /** Selected team roles */
    teams: string[];
    /** Status sub-filter applied to all selected teams */
    statuses: string[];
}

/** State for the Priority quick filter (priority + team sub-filter) */
export interface QuickFilterPriorityState {
    /** Selected priority levels */
    priorities: string[];
    /** Team sub-filter (default: all teams selected) */
    teams: string[];
}

/** Combined quick filter state passed from page to toolbar */
export interface QuickFilterState {
    activeMode: QuickFilterMode;
    status: QuickFilterStatusState;
    team: QuickFilterTeamState;
    priority: QuickFilterPriorityState;
}

/** Default initial state */
export const EMPTY_QUICK_FILTER_STATUS: QuickFilterStatusState = { statuses: [] };
export const EMPTY_QUICK_FILTER_TEAM: QuickFilterTeamState = { teams: [], statuses: [] };
export const EMPTY_QUICK_FILTER_PRIORITY: QuickFilterPriorityState = { priorities: [], teams: [] };

export const EMPTY_QUICK_FILTER: QuickFilterState = {
    activeMode: null,
    status: EMPTY_QUICK_FILTER_STATUS,
    team: EMPTY_QUICK_FILTER_TEAM,
    priority: EMPTY_QUICK_FILTER_PRIORITY,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types/quickFilter.ts
git commit -m "feat: add quick filter v2 type definitions"
```

---

### Task 2: Shared QuickFilterDropdown (portal shell)

**Files:**
- Create: `src/components/QuickFilterDropdown.tsx`

- [ ] **Step 1: Create the shared dropdown portal component**

This component handles: portal rendering, fixed positioning from anchor rect, close-on-outside-click, close-on-Escape.

```tsx
// src/components/QuickFilterDropdown.tsx
'use client';

import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface QuickFilterDropdownProps {
    anchorRect: DOMRect;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
}

export default function QuickFilterDropdown({
    anchorRect,
    onClose,
    children,
    width = 280,
}: QuickFilterDropdownProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        // Use setTimeout to avoid the opening click from immediately closing
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', onMouseDown);
        }, 0);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[9999] rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{
                left: anchorRect.left,
                top: anchorRect.bottom + 4,
                width,
            }}
        >
            {children}
        </div>,
        document.body
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickFilterDropdown.tsx
git commit -m "feat: add shared QuickFilterDropdown portal component"
```

---

### Task 3: Shared QuickFilterButton

**Files:**
- Create: `src/components/QuickFilterButton.tsx`

- [ ] **Step 1: Create the shared button component**

Handles three visual states: active (colored), inactive (default), disabled (greyed out, not clickable).

```tsx
// src/components/QuickFilterButton.tsx
'use client';

import { useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

interface QuickFilterButtonProps {
    label: string;
    count: number;
    isActive: boolean;
    isDisabled: boolean;
    accentColor: string;
    onClick: (rect: DOMRect) => void;
    isOpen: boolean;
}

export default function QuickFilterButton({
    label,
    count,
    isActive,
    isDisabled,
    accentColor,
    onClick,
    isOpen,
}: QuickFilterButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);

    const handleClick = useCallback(() => {
        if (isDisabled) return;
        if (ref.current) {
            onClick(ref.current.getBoundingClientRect());
        }
    }, [isDisabled, onClick]);

    const displayLabel = count > 0 ? `${label} (${count})` : label;

    return (
        <button
            ref={ref}
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-[9px] border px-2.5 text-xs font-semibold transition-colors ${
                isDisabled
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                    : isActive
                        ? 'border-transparent text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
            }`}
            style={isActive && !isDisabled ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            title={isDisabled ? 'Tắt filter đang active để dùng filter này' : undefined}
        >
            <span className="truncate max-w-[100px]">{displayLabel}</span>
            <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickFilterButton.tsx
git commit -m "feat: add shared QuickFilterButton with active/disabled states"
```

---

### Task 4: QuickFilterStatus Component

**Files:**
- Create: `src/components/QuickFilterStatus.tsx`

- [ ] **Step 1: Create the Status filter dropdown**

Simple dropdown: preset pills (Dang lam, To do, Done) + full status checkbox list. Same layout as old `ToolbarQuickFilter` but uses the shared shell.

```tsx
// src/components/QuickFilterStatus.tsx
'use client';

import { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { STATUS_OPTIONS } from '@/types/roadmap';
import type { QuickFilterStatusState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#6366f1';

const PRESET_DOING = {
    label: 'Dang lam',
    values: STATUS_OPTIONS.filter(s =>
        s.includes('Handle') || s.includes('in progress') || s === 'Task Pending'
    ),
};
const PRESET_TODO = {
    label: 'To do',
    values: ['Not Started', 'Task To do'],
};
const PRESET_DONE = {
    label: 'Done',
    values: STATUS_OPTIONS.filter(s => s.includes('Done')),
};
const STATUS_PRESETS = [PRESET_DOING, PRESET_TODO, PRESET_DONE];
const VISIBLE_STATUSES = STATUS_OPTIONS.filter(s => s !== 'None');

interface Props {
    state: QuickFilterStatusState;
    onChange: (next: QuickFilterStatusState) => void;
    isDisabled: boolean;
}

export default function QuickFilterStatus({ state, onChange, isDisabled }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    const selectedSet = new Set(state.statuses);
    const count = state.statuses.length;

    const toggleStatus = (value: string) => {
        const next = new Set(state.statuses);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        onChange({ statuses: Array.from(next) });
    };

    const applyPreset = (preset: { label: string; values: string[] }) => {
        const presetSet = new Set(preset.values);
        const isExact = state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
        onChange({ statuses: isExact ? [] : [...preset.values] });
    };

    const isPresetExact = (preset: { values: string[] }): boolean => {
        const presetSet = new Set(preset.values);
        return state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
    };

    const isPresetPartial = (preset: { values: string[] }): boolean => {
        return state.statuses.length > 0 && preset.values.every(v => selectedSet.has(v));
    };

    return (
        <>
            <QuickFilterButton
                label="Status"
                count={count}
                isActive={count > 0}
                isDisabled={isDisabled}
                accentColor={ACCENT}
                onClick={handleButtonClick}
                isOpen={isOpen}
            />
            {isOpen && anchorRect && (
                <QuickFilterDropdown anchorRect={anchorRect} onClose={close}>
                    {/* Presets */}
                    <div className="border-b border-gray-100 px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Presets</span>
                            {count > 0 && (
                                <button type="button" onClick={() => onChange({ statuses: [] })}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoa tat ca
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {STATUS_PRESETS.map(preset => {
                                const exact = isPresetExact(preset);
                                const partial = isPresetPartial(preset);
                                return (
                                    <button key={preset.label} type="button" onClick={() => applyPreset(preset)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            exact
                                                ? 'border-transparent text-white'
                                                : partial
                                                    ? 'border-transparent text-white opacity-80'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                                        }`}
                                        style={exact || partial ? { backgroundColor: ACCENT } : undefined}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* All statuses */}
                    <div className="max-h-56 overflow-y-auto px-1.5 py-1.5">
                        {VISIBLE_STATUSES.map(option => {
                            const checked = selectedSet.has(option);
                            return (
                                <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
                                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                        checked ? 'border-transparent text-white' : 'border-gray-300'
                                    }`} style={checked ? { backgroundColor: ACCENT } : undefined}>
                                        {checked && <Check size={10} strokeWidth={3} />}
                                    </span>
                                    <span className="truncate text-xs text-gray-700">{option}</span>
                                </label>
                            );
                        })}
                    </div>
                </QuickFilterDropdown>
            )}
        </>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickFilterStatus.tsx
git commit -m "feat: add QuickFilterStatus dropdown component"
```

---

### Task 5: QuickFilterTeam Component

**Files:**
- Create: `src/components/QuickFilterTeam.tsx`

- [ ] **Step 1: Create the Team filter dropdown with status sub-filter**

Two sections: top = status preset pills (Dang lam / To do / Done), bottom = team checkboxes.

```tsx
// src/components/QuickFilterTeam.tsx
'use client';

import { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { STATUS_OPTIONS, TEAM_ROLES } from '@/types/roadmap';
import type { QuickFilterTeamState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#0891b2';

const STATUS_PRESET_DOING = {
    label: 'Dang lam',
    values: STATUS_OPTIONS.filter(s =>
        s.includes('Handle') || s.includes('in progress') || s === 'Task Pending'
    ),
};
const STATUS_PRESET_TODO = {
    label: 'To do',
    values: ['Not Started', 'Task To do'],
};
const STATUS_PRESET_DONE = {
    label: 'Done',
    values: STATUS_OPTIONS.filter(s => s.includes('Done')),
};
const STATUS_PRESETS = [STATUS_PRESET_DOING, STATUS_PRESET_TODO, STATUS_PRESET_DONE];

interface Props {
    state: QuickFilterTeamState;
    onChange: (next: QuickFilterTeamState) => void;
    isDisabled: boolean;
}

export default function QuickFilterTeam({ state, onChange, isDisabled }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    const selectedTeams = new Set(state.teams);
    const selectedStatuses = new Set(state.statuses);
    const count = state.teams.length;

    const toggleTeam = (role: string) => {
        const next = new Set(state.teams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        onChange({ ...state, teams: Array.from(next) });
    };

    const selectAllTeams = () => {
        onChange({ ...state, teams: [...TEAM_ROLES] });
    };

    const clearTeams = () => {
        onChange({ ...state, teams: [] });
    };

    const applyStatusPreset = (preset: { values: string[] }) => {
        const presetSet = new Set(preset.values);
        const isExact = state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
        onChange({ ...state, statuses: isExact ? [] : [...preset.values] });
    };

    const isStatusPresetExact = (preset: { values: string[] }): boolean => {
        const presetSet = new Set(preset.values);
        return state.statuses.length === preset.values.length
            && state.statuses.every(v => presetSet.has(v));
    };

    const isStatusPresetPartial = (preset: { values: string[] }): boolean => {
        return state.statuses.length > 0 && preset.values.every(v => selectedStatuses.has(v));
    };

    return (
        <>
            <QuickFilterButton
                label="Team"
                count={count}
                isActive={count > 0}
                isDisabled={isDisabled}
                accentColor={ACCENT}
                onClick={handleButtonClick}
                isOpen={isOpen}
            />
            {isOpen && anchorRect && (
                <QuickFilterDropdown anchorRect={anchorRect} onClose={close}>
                    {/* Status sub-filter */}
                    <div className="border-b border-gray-100 px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trang thai</span>
                            {state.statuses.length > 0 && (
                                <button type="button" onClick={() => onChange({ ...state, statuses: [] })}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoa
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {STATUS_PRESETS.map(preset => {
                                const exact = isStatusPresetExact(preset);
                                const partial = isStatusPresetPartial(preset);
                                return (
                                    <button key={preset.label} type="button" onClick={() => applyStatusPreset(preset)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            exact
                                                ? 'border-transparent text-white'
                                                : partial
                                                    ? 'border-transparent text-white opacity-80'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                                        }`}
                                        style={exact || partial ? { backgroundColor: ACCENT } : undefined}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Team selection */}
                    <div className="px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={selectAllTeams}
                                    className="text-[10px] font-semibold text-cyan-600 hover:text-cyan-700">
                                    Chon het
                                </button>
                                <button type="button" onClick={clearTeams}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoa
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {TEAM_ROLES.map(role => {
                                const checked = selectedTeams.has(role);
                                return (
                                    <label key={role} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
                                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                            checked ? 'border-transparent text-white' : 'border-gray-300'
                                        }`} style={checked ? { backgroundColor: ACCENT } : undefined}>
                                            {checked && <Check size={10} strokeWidth={3} />}
                                        </span>
                                        <span className="text-xs text-gray-700">{role}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </QuickFilterDropdown>
            )}
        </>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickFilterTeam.tsx
git commit -m "feat: add QuickFilterTeam with status sub-filter"
```

---

### Task 6: QuickFilterPriority Component

**Files:**
- Create: `src/components/QuickFilterPriority.tsx`

- [ ] **Step 1: Create the Priority filter dropdown with team sub-filter**

Two sections: top = priority preset pills (High / Medium / Low), bottom = team checkboxes (default all selected).

```tsx
// src/components/QuickFilterPriority.tsx
'use client';

import { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { PRIORITY_LEVELS, TEAM_ROLES } from '@/types/roadmap';
import type { QuickFilterPriorityState } from '@/types/quickFilter';
import QuickFilterButton from './QuickFilterButton';
import QuickFilterDropdown from './QuickFilterDropdown';

const ACCENT = '#ea580c';
const VISIBLE_PRIORITIES = PRIORITY_LEVELS.filter(p => p !== 'Reported');

interface Props {
    state: QuickFilterPriorityState;
    onChange: (next: QuickFilterPriorityState) => void;
    isDisabled: boolean;
}

export default function QuickFilterPriority({ state, onChange, isDisabled }: Props) {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const isOpen = anchorRect !== null;

    const handleButtonClick = useCallback((rect: DOMRect) => {
        setAnchorRect(prev => prev ? null : rect);
    }, []);

    const close = useCallback(() => setAnchorRect(null), []);

    const selectedPriorities = new Set(state.priorities);
    const selectedTeams = new Set(state.teams);
    const count = state.priorities.length;

    const togglePriority = (value: string) => {
        const next = new Set(state.priorities);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        // When first priority is selected and no teams yet, default to all teams
        const nextPriorities = Array.from(next);
        const nextTeams = state.teams.length === 0 && nextPriorities.length > 0
            ? [...TEAM_ROLES]
            : state.teams;
        onChange({ priorities: nextPriorities, teams: nextTeams });
    };

    const applyPriorityPreset = (value: string) => {
        const isExact = state.priorities.length === 1 && state.priorities[0] === value;
        if (isExact) {
            onChange({ ...state, priorities: [] });
        } else {
            const nextTeams = state.teams.length === 0 ? [...TEAM_ROLES] : state.teams;
            onChange({ priorities: [value], teams: nextTeams });
        }
    };

    const toggleTeam = (role: string) => {
        const next = new Set(state.teams);
        if (next.has(role)) next.delete(role);
        else next.add(role);
        onChange({ ...state, teams: Array.from(next) });
    };

    const selectAllTeams = () => {
        onChange({ ...state, teams: [...TEAM_ROLES] });
    };

    const clearTeams = () => {
        onChange({ ...state, teams: [] });
    };

    return (
        <>
            <QuickFilterButton
                label="Priority"
                count={count}
                isActive={count > 0}
                isDisabled={isDisabled}
                accentColor={ACCENT}
                onClick={handleButtonClick}
                isOpen={isOpen}
            />
            {isOpen && anchorRect && (
                <QuickFilterDropdown anchorRect={anchorRect} onClose={close}>
                    {/* Priority selection */}
                    <div className="border-b border-gray-100 px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Priority</span>
                            {count > 0 && (
                                <button type="button" onClick={() => onChange({ ...state, priorities: [] })}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoa
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {VISIBLE_PRIORITIES.map(p => {
                                const isExact = state.priorities.length === 1 && state.priorities[0] === p;
                                const isSelected = selectedPriorities.has(p);
                                return (
                                    <button key={p} type="button" onClick={() => applyPriorityPreset(p)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                            isExact
                                                ? 'border-transparent text-white'
                                                : isSelected
                                                    ? 'border-transparent text-white opacity-80'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                                        }`}
                                        style={isSelected ? { backgroundColor: ACCENT } : undefined}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Full priority checkbox list */}
                    <div className="border-b border-gray-100 px-1.5 py-1.5">
                        {VISIBLE_PRIORITIES.map(option => {
                            const checked = selectedPriorities.has(option);
                            return (
                                <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
                                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                        checked ? 'border-transparent text-white' : 'border-gray-300'
                                    }`} style={checked ? { backgroundColor: ACCENT } : undefined}>
                                        {checked && <Check size={10} strokeWidth={3} />}
                                    </span>
                                    <span className="text-xs text-gray-700">{option}</span>
                                </label>
                            );
                        })}
                    </div>

                    {/* Team sub-filter */}
                    <div className="px-2.5 py-2">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</span>
                            <div className="flex gap-2">
                                <button type="button" onClick={selectAllTeams}
                                    className="text-[10px] font-semibold text-orange-600 hover:text-orange-700">
                                    Chon het
                                </button>
                                <button type="button" onClick={clearTeams}
                                    className="text-[10px] font-semibold text-gray-400 hover:text-gray-600">
                                    Xoa
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {TEAM_ROLES.map(role => {
                                const checked = selectedTeams.has(role);
                                return (
                                    <label key={role} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
                                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                            checked ? 'border-transparent text-white' : 'border-gray-300'
                                        }`} style={checked ? { backgroundColor: ACCENT } : undefined}>
                                            {checked && <Check size={10} strokeWidth={3} />}
                                        </span>
                                        <span className="text-xs text-gray-700">{role}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </QuickFilterDropdown>
            )}
        </>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/QuickFilterPriority.tsx
git commit -m "feat: add QuickFilterPriority with team sub-filter"
```

---

### Task 7: Update Toolbar — Replace Quick Filter Section + Add Expand/Collapse

**Files:**
- Modify: `src/components/Toolbar.tsx` (lines 8-9 imports, lines 59-99 props, lines 102-111 destructure, lines 277-320 quick filter section)
- Delete: `src/components/ToolbarQuickFilter.tsx` (after Toolbar is updated)

- [ ] **Step 1: Update Toolbar imports**

Replace old imports at the top of `Toolbar.tsx`:

```typescript
// REMOVE these lines:
import { normalizeWeekColor, PhaseOption, STATUS_OPTIONS, TEAM_ROLES, PRIORITY_LEVELS } from '@/types/roadmap';
import ToolbarQuickFilter, { type QuickFilterPreset } from './ToolbarQuickFilter';

// REPLACE with:
import { normalizeWeekColor, PhaseOption } from '@/types/roadmap';
import type { QuickFilterState, QuickFilterStatusState, QuickFilterTeamState, QuickFilterPriorityState } from '@/types/quickFilter';
import QuickFilterStatus from './QuickFilterStatus';
import QuickFilterTeam from './QuickFilterTeam';
import QuickFilterPriority from './QuickFilterPriority';
```

Also add `ChevronsUp, ChevronsDown` to the lucide import:

```typescript
import {
    Save, Download, FileJson, Loader2, Flag, Check,
    Pencil, Settings, X, ChevronRight, ChevronDown, Upload, Filter, Unlock, ArrowLeft,
    ChevronsUp, ChevronsDown
} from 'lucide-react';
```

- [ ] **Step 2: Remove old preset constants**

Delete lines 13-39 (the `STATUS_PRESET_DOING`, `STATUS_PRESET_TODO`, `STATUS_PRESET_DONE`, `STATUS_PRESETS`, `TEAM_PRESETS`, `PRIORITY_PRESETS` constants). These are now inside the individual components.

- [ ] **Step 3: Update ToolbarProps interface**

Replace the old quick filter props:

```typescript
// REMOVE these lines from ToolbarProps:
    isJsonMode?: boolean;
    onQuickFilterChange?: (type: 'category' | 'status' | 'team' | 'priority' | 'phase' | 'subcategory' | 'groupItemType', values: string[]) => void;

// ADD these lines:
    isJsonMode?: boolean;
    quickFilter: QuickFilterState;
    onQuickFilterStatusChange: (next: QuickFilterStatusState) => void;
    onQuickFilterTeamChange: (next: QuickFilterTeamState) => void;
    onQuickFilterPriorityChange: (next: QuickFilterPriorityState) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
```

- [ ] **Step 4: Update the component destructuring**

```typescript
// In the function parameters, REPLACE:
    isJsonMode, onQuickFilterChange

// WITH:
    isJsonMode, quickFilter, onQuickFilterStatusChange, onQuickFilterTeamChange, onQuickFilterPriorityChange,
    onExpandAll, onCollapseAll
```

- [ ] **Step 5: Replace the quick filter rendering block**

Replace the entire `{isJsonMode ? (...) : (...)}` block (lines 277-320) with:

```tsx
                    {isJsonMode ? (
                        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                            {quickViewButtons.map(button => (
                                <button
                                    key={button.mode}
                                    onClick={() => onToggleQuickViewMode(button.mode)}
                                    title="Quick filter: ket hop AND voi cac filter khac"
                                    className={`h-8 shrink-0 rounded-[9px] border px-3 text-xs font-semibold transition-colors ${button.mode === 'reported' ? 'max-w-[190px] truncate' : ''} ${button.active
                                        ? 'border-[#F0B90B] bg-[#F0B90B] text-slate-900'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
                                        }`}
                                >
                                    {button.label}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                            <QuickFilterStatus
                                state={quickFilter.status}
                                onChange={onQuickFilterStatusChange}
                                isDisabled={quickFilter.activeMode !== null && quickFilter.activeMode !== 'status'}
                            />
                            <QuickFilterTeam
                                state={quickFilter.team}
                                onChange={onQuickFilterTeamChange}
                                isDisabled={quickFilter.activeMode !== null && quickFilter.activeMode !== 'team'}
                            />
                            <QuickFilterPriority
                                state={quickFilter.priority}
                                onChange={onQuickFilterPriorityChange}
                                isDisabled={quickFilter.activeMode !== null && quickFilter.activeMode !== 'priority'}
                            />
                        </div>
                    )}

                    {/* Expand/Collapse All */}
                    <div className="flex shrink-0 items-center gap-0.5">
                        <button
                            type="button"
                            onClick={onExpandAll}
                            title="Mo tat ca"
                            className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
                        >
                            <ChevronsDown size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={onCollapseAll}
                            title="Dong tat ca"
                            className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
                        >
                            <ChevronsUp size={14} />
                        </button>
                    </div>
```

- [ ] **Step 6: Delete old ToolbarQuickFilter.tsx**

```bash
rm src/components/ToolbarQuickFilter.tsx
```

- [ ] **Step 7: Verify TypeScript compiles**

This will likely fail because `page.tsx` still passes old props. That is expected — we fix page.tsx in the next task.

- [ ] **Step 8: Commit**

```bash
git add -u src/components/Toolbar.tsx src/components/ToolbarQuickFilter.tsx
git commit -m "feat: replace Toolbar quick filters with v2 components + expand/collapse buttons"
```

---

### Task 8: Update page.tsx — Quick Filter State Management + Expand/Collapse

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`

This is the most important task. We need to:
1. Add quick filter state (`activeQuickFilter`, per-mode sub-states)
2. Map the active quick filter to `RoadmapTreeFilters`
3. Add expand/collapse all handlers
4. Update Toolbar props

- [ ] **Step 1: Add imports**

At the top of `page.tsx`, add:

```typescript
import type {
    QuickFilterState,
    QuickFilterStatusState,
    QuickFilterTeamState,
    QuickFilterPriorityState,
    QuickFilterMode,
} from '@/types/quickFilter';
import {
    EMPTY_QUICK_FILTER,
    EMPTY_QUICK_FILTER_STATUS,
    EMPTY_QUICK_FILTER_TEAM,
    EMPTY_QUICK_FILTER_PRIORITY,
} from '@/types/quickFilter';
```

- [ ] **Step 2: Add quick filter state declarations**

After the existing filter state declarations (around line 220-221, after `filterGroupItemType` and `isReportedMode`), add:

```typescript
  // Quick filter v2 state (mutual exclusion: only one mode active at a time)
  const [quickFilterMode, setQuickFilterMode] = useState<QuickFilterMode>(null);
  const [qfStatus, setQfStatus] = useState<QuickFilterStatusState>(EMPTY_QUICK_FILTER_STATUS);
  const [qfTeam, setQfTeam] = useState<QuickFilterTeamState>(EMPTY_QUICK_FILTER_TEAM);
  const [qfPriority, setQfPriority] = useState<QuickFilterPriorityState>(EMPTY_QUICK_FILTER_PRIORITY);
```

- [ ] **Step 3: Add quick filter change handlers**

After the existing `handleFilterChange` callback (around line 1136), add:

```typescript
  const handleQfStatusChange = useCallback((next: QuickFilterStatusState) => {
      setQfStatus(next);
      if (next.statuses.length > 0) {
          setQuickFilterMode('status');
      } else {
          setQuickFilterMode(null);
      }
  }, []);

  const handleQfTeamChange = useCallback((next: QuickFilterTeamState) => {
      setQfTeam(next);
      if (next.teams.length > 0) {
          setQuickFilterMode('team');
      } else if (next.statuses.length === 0) {
          setQuickFilterMode(null);
      }
  }, []);

  const handleQfPriorityChange = useCallback((next: QuickFilterPriorityState) => {
      setQfPriority(next);
      if (next.priorities.length > 0) {
          setQuickFilterMode('priority');
      } else if (next.teams.length === 0) {
          setQuickFilterMode(null);
      }
  }, []);

  const quickFilterState = useMemo<QuickFilterState>(() => ({
      activeMode: quickFilterMode,
      status: qfStatus,
      team: qfTeam,
      priority: qfPriority,
  }), [quickFilterMode, qfStatus, qfTeam, qfPriority]);
```

- [ ] **Step 4: Map active quick filter to RoadmapTreeFilters**

The existing `exportVisibleRows` and `exportSummaryRows` memos build a `filters` object from `filterCategory`, `filterStatus`, etc. We need to **override** `filterStatus`, `filterTeam`, and `filterPriority` when a quick filter mode is active.

Find the two `filters` object constructions (around lines 681-684 and 691-694) and the `getVisibleFlattenedRows` call. We need a shared computed `effectiveFilters` memo. Add this **before** the `exportVisibleRows` memo:

```typescript
  // Compute effective filters: quick filter overrides Status/Team/Priority when active
  const effectiveFilters = useMemo(() => {
      let effectiveStatus = filterStatus;
      let effectiveTeam = filterTeam;
      let effectivePriority = filterPriority;

      if (storageMode !== 'json' && quickFilterMode) {
          // Quick filter is active — override the matching filter dimensions
          switch (quickFilterMode) {
              case 'status':
                  effectiveStatus = qfStatus.statuses;
                  effectiveTeam = [];
                  effectivePriority = [];
                  break;
              case 'team':
                  effectiveTeam = qfTeam.teams;
                  effectiveStatus = qfTeam.statuses;
                  effectivePriority = [];
                  break;
              case 'priority':
                  effectivePriority = qfPriority.priorities;
                  effectiveTeam = qfPriority.teams;
                  effectiveStatus = [];
                  break;
          }
      }

      return {
          category: filterCategory,
          status: effectiveStatus,
          team: effectiveTeam,
          priority: effectivePriority,
          phase: filterPhase,
          subcategory: filterSubcategory,
          groupItemType: filterGroupItemType,
      };
  }, [
      storageMode, quickFilterMode, qfStatus, qfTeam, qfPriority,
      filterCategory, filterStatus, filterTeam, filterPriority,
      filterPhase, filterSubcategory, filterGroupItemType,
  ]);
```

Then update `exportVisibleRows` and `exportSummaryRows` to use `effectiveFilters`:

```typescript
  const exportVisibleRows = useMemo(() => {
      if (!data) return [];
      return getVisibleFlattenedRows(data.items, effectiveFilters, expandedIds, hiddenRowIds);
  }, [data, effectiveFilters, expandedIds, hiddenRowIds]);

  const exportSummaryRows = useMemo(() => {
      if (!data) return [];
      const filteredItems = filterRoadmapTree(data.items, effectiveFilters);
      return flattenRoadmap(filteredItems);
  }, [data, effectiveFilters]);
```

Also find any other places where `filters` object is constructed inline and replace with `effectiveFilters`. Search for all usages of `filterStatus` in filter objects being passed to `filterRoadmapTree` or `getVisibleFlattenedRows`.

- [ ] **Step 5: Add expand/collapse all handlers**

Add these callbacks (near the other handlers):

```typescript
  const handleExpandAll = useCallback(() => {
      if (!data) return;
      const ids = new Set<string>();
      const collect = (items: RoadmapItem[]) => {
          for (const item of items) {
              if (item.children?.length) {
                  ids.add(item.id);
                  collect(item.children);
              }
          }
      };
      collect(data.items);
      setExpandedIds(ids);
  }, [data]);

  const handleCollapseAll = useCallback(() => {
      setExpandedIds(new Set());
  }, []);
```

- [ ] **Step 6: Update Toolbar props in JSX**

Replace the old quick filter props on the `<Toolbar>` JSX:

```tsx
// REMOVE:
        isJsonMode={storageMode === 'json'}
        onQuickFilterChange={handleFilterChange}

// REPLACE WITH:
        isJsonMode={storageMode === 'json'}
        quickFilter={quickFilterState}
        onQuickFilterStatusChange={handleQfStatusChange}
        onQuickFilterTeamChange={handleQfTeamChange}
        onQuickFilterPriorityChange={handleQfPriorityChange}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
```

- [ ] **Step 7: Update SpreadsheetGrid filter props**

Find where SpreadsheetGrid receives filter props and update to use `effectiveFilters`:

```tsx
// In SpreadsheetGrid props, CHANGE:
          filterCategory={filterCategory}
          filterStatus={filterStatus}
          filterTeam={filterTeam}
          filterPriority={filterPriority}
// TO:
          filterCategory={effectiveFilters.category}
          filterStatus={effectiveFilters.status}
          filterTeam={effectiveFilters.team}
          filterPriority={effectiveFilters.priority}
```

Keep `filterPhase`, `filterSubcategory`, `filterGroupItemType` as-is (they always come from the sidebar filter state).

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/app/roadmap/[id]/page.tsx
git commit -m "feat: wire quick filter v2 state management with mutual exclusion and expand/collapse all"
```

---

### Task 9: Remove console.log Debug Lines

**Files:**
- Modify: `src/app/roadmap/[id]/page.tsx`
- Modify: `src/app/api/roadmap/[id]/version/route.ts`

- [ ] **Step 1: Remove debug console.log from page.tsx**

In `fetchRoadmapVersion`, remove:

```typescript
        console.log('[roadmap] storageMode from server:', payload.storageMode);
```

- [ ] **Step 2: Remove debug console.log from version route**

In `route.ts`, remove:

```typescript
        console.log(`[version] roadmap=${id} storageMode=${mode}`);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/roadmap/[id]/page.tsx src/app/api/roadmap/[id]/version/route.ts
git commit -m "chore: remove debug console.log from version endpoint and page"
```

---

### Task 10: Manual Verification

- [ ] **Step 1: Start dev server and test**

Run: `npm run dev`

Test checklist:
1. Open a table-mode roadmap — should see Status / Team / Priority quick filter buttons (NOT Web / App / Reported)
2. Open a json-mode roadmap — should still see Web / App / Reported buttons
3. Click Status → dropdown opens with presets (Dang lam, To do, Done) and full status list
4. When Status is active → Team and Priority buttons are greyed out and not clickable
5. Clear Status selection → all three buttons are enabled again
6. Click Team → dropdown has status presets at top, team checkboxes at bottom
7. Select Team FE + status "Dang lam" → tree filters to show FE team items with in-progress status
8. Click Priority → dropdown has priority pills at top, team checkboxes at bottom
9. Select High priority → team checkboxes default to all selected
10. Expand All button → all tree nodes expand
11. Collapse All button → all tree nodes collapse to root level
12. Sidebar Filter panel still works independently (for category, subcategory, phase, groupItemType)

- [ ] **Step 2: Final commit if any fixes needed**
