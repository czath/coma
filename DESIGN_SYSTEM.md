# CORE.AI Design System & Style Guide

## 1. Layout Structure: 2-Tier Header
Every main view must prioritize the 2-tier header structure to separate global identity from page-specific context and actions.

### Tier 1: Global Brand Bar
- **Height**: Fixed 64px (approx, based on padding/content).
- **Background**: `bg-white border-b border-gray-200`.
- **Components**:
    - **Logo Section (Left)**: Icon (`bg-indigo-600` rounded-lg) + Brand Name (`text-xl font-bold text-gray-900`) + Subtext (`text-xs font-medium text-gray-500 uppercase tracking-wide`).
    - **Page Indicator (Right)**: Current view name in `text-xs font-medium text-gray-500 uppercase tracking-wide` (identical to subtext style).

### Tier 2: Page Toolbar
- **Height**: Fixed 56px (approx).
- **Background**: `bg-white border-b border-gray-200`.
- **Shadow**: `shadow-sm` for depth.
- **Content**:
    - **Left Side**: Contextual info (Back button, Filename, Status Pills).
    - **Right Side**: Primary/Secondary actions (Compacted Icon Buttons).

---

## 2. Typography
Consistency in font sizes and weights is mandatory to avoid visual clutter.

- **Primary Titles (App)**: `text-xl font-bold text-gray-900`
- **Sub-Labels / Indicators**: `text-xs font-medium text-gray-500 uppercase tracking-wide`
- **Filenames**: `text-sm font-medium text-gray-900 whitespace-normal break-words` (Always allow wrapping for long names).
- **Pill Text**: `text-xs font-medium`
- **Monospace (IDs/Code)**: `text-[10px] font-mono text-gray-400`

---

## 3. Standardized Components

### Status & Type Pills (`status-badge`)
- **Base Style**: `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap`
- **Variants**:
    - **Master**: `bg-indigo-100 text-indigo-700 border-indigo-200`
    - **Subordinate**: `bg-orange-100 text-orange-700 border-orange-200`
    - **Reference**: `bg-teal-100 text-teal-700 border-teal-200`
    - **Status (Draft)**: `bg-orange-100 text-orange-700 border-orange-200`
    - **Status (Final)**: `bg-blue-100 text-blue-700 border-blue-200`
    - **Method (AI)**: `bg-purple-100 text-purple-700 border-purple-200`

### Compact Icon Buttons
Actions should be compacted to icons whenever possible to save space.
- **Standard Round Button**: `text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full`
- **Emphasized Action (Subtle)**: `text-indigo-600 p-2 bg-indigo-50 hover:bg-indigo-100 rounded-full` (e.g., Finalize, Run).
- **Emphasized Action (Purple)**: `text-purple-600 p-2 bg-purple-50 hover:bg-purple-100 rounded-full` (e.g., Taxonomy).

---

## 4. Iconography
Use **Lucide React** icons.
- **Brand**: `FileSignature` (2.5 stroke width)
- **Finalize**: `BadgeCheck` (Seal)
- **Save**: `Save` (Disk)
- **Add**: `Plus`
- **Export**: `FileJson`
- **Taxonomy**: `Network`
- **Back**: `ArrowLeft`
