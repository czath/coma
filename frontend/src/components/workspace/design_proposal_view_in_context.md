# Design Proposal: View in Context

## Objective
Enable users to click on extracted data (Term Sheet fields, References, Glossary) and view the corresponding source text in its original context.

## Challenge
The current analysis extracts *normalized data* (e.g., "2023-01-01") which may not strictly match the *source text* (e.g., "January 1st, 2023").
- **Term Sheet**: Fields like `effective_date`, `governing_law`, `currency` are normalized. Searching for them directly is unreliable.
- **References**: Specifically include a `context` field (e.g., "subject to Clause 12..."). This is highly search-friendly.
- **Glossary**: Terms (`term`) are exact strings, but may appear multiple times.

## Proposed Solutions

### 1. UI Interaction: The "Context Split-Pane"
Instead of a modal (which covers data), we implement a **slide-over Right Panel** (approx. 40% width).
- **Behavior**: Clicking a card opens the pane.
- **Benefit**: Users can read the source text while referencing the extracted summary side-by-side.
- **Content**: Displays the specific **Section** containing the match, not the whole document.

### 2. Search & Linking Strategy

#### A. For References (High Confidence)
- **Source**: Use the `ref.context` field (e.g., "Indemnification under Clause 12").
- **Method**: Exact/Fuzzy search this string in the document.
- **Result**: Highlight the context string and the specific reference.

#### B. For Glossary (Multi-Match)
- **Source**: Use the `glossary.term` field.
- **Method**: Search for **all occurrences** of the term in the document.
- **UI**: The Right Panel provides "Previous / Next" navigation (e.g., "Match 1 of 5") to jump between occurrences.

#### C. For Term Sheet (The Challenge)
*Current Data*: We have `value` (normalized). We lack `citation`.
- **Option 1 (Quick)**: Fuzzy search for the *value*.
    - *Risk*: "USD" might not match "US Dollars". "New York" matches many things.
- **Option 2 (Robust - Recommended)**: Update the Backend Prompt.
    - Modify `contract_profiler.txt` to return `citation` or `source_snippet` alongside `value`.
    - *Example*: `{ "role": "Buyer", "name": "ZebraCorp", "citation": "...made by and between ZebraCorp..." }`
    - **Fallback**: If no citation, try fuzzy search of the value.

## Implementation Plan
1.  **Frontend**: Create `ContextSidePane` component (Slide-in).
2.  **Frontend**: Implement `useContextFinder` hook.
    - Logic: Search `file.content` blocks.
    - Smart text aggregation (Header-to-Header content grouping).
3.  **Backend (Optional but Recommended)**: Update `contract_profiler.txt` to extract citations for Term Sheet fields.

## Question for Approval
**Shall we proceed with just Frontend Search (Option 1) for Term Sheet, or update the Backend Prompts (Option 2) to extract precise citations?**
Option 2 requires re-running analysis on files to see the benefit.
