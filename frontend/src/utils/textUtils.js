import Fuse from 'fuse.js';

/**
 * Normalizes text by standardizing whitespace, newlines, and case.
 */
export const normalizeText = (str) => {
    return (str || "")
        .replace(/[\s\n\u00A0]+/g, " ")
        .trim()
        .toLowerCase();
};

/**
 * Creates a professional-grade flexible regex from a citation string.
 */
/**
 * Creates a professional-grade flexible regex from a citation string.
 * NOW RESILIENT: Ignores minor punctuation differences.
 */
export const createFlexibleRegex = (text) => {
    if (!text) return null;
    const cleanText = text.trim();
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Split by non-word characters (whitespace, punctuation) to get pure "words"
    const parts = cleanText.split(/[\W_]+/).filter(part => part.length > 0);

    if (parts.length === 0) return null;

    const escapedParts = parts.map(part => escapeRegExp(part));

    // Match any sequence of non-word chars (whitespace, punctuation, etc.) between words
    // Allow 1+ non-word characters
    let pattern = escapedParts.join("[\\W_]+");

    // Boundary checks (start/end of word)
    // If the original text started/ended with a word char, enforce boundary
    if (/^\w/.test(cleanText)) pattern = `\\b${pattern}`;
    if (/\w$/.test(cleanText)) pattern = `${pattern}\\b`;

    return new RegExp(pattern, 'gi');
};

/**
 * Helper: Find sentence boundaries around a match index.
 */
const expandToSentence = (text, start, end) => {
    if (!text) return { start, end };

    // Look backwards for sentence end (. ? !) or newline
    let newStart = start;
    while (newStart > 0) {
        const char = text[newStart - 1];
        if (/[.?!]/.test(char) || char === '\n') {
            break;
        }
        newStart--;
    }
    // Trim leading whitespace from expansion
    while (newStart < start && /\s/.test(text[newStart])) {
        newStart++;
    }

    // Look forwards for sentence end
    let newEnd = end;
    while (newEnd < text.length) {
        const char = text[newEnd];
        if (/[.?!]/.test(char) || char === '\n') {
            newEnd++; // Include the punctuation
            break;
        }
        newEnd++;
    }

    return { start: newStart, end: newEnd };
};

/**
 * Professional multi-stage matching to find a citation in NATIVE SECTIONS.
 * This ensures 1 Citation = 1 FULL Section.
 * 
 * @param {Array} sections - The pre-grouped sections [{id, title, text}, ...]
 * @param {string} citation - The verbatim text to find
 */
export const findCitationInSections = (sections, citation) => {
    if (!sections || !citation) return null;

    const targetClean = normalizeText(citation);
    const regex = createFlexibleRegex(citation);

    // --- STAGE 1: Flexible Verbatim Match within Sections ---
    // Try exact inclusion or flexible regex
    let foundIndex = sections.findIndex(s => s.text && normalizeText(s.text).includes(targetClean));
    if (foundIndex === -1 && regex) {
        foundIndex = sections.findIndex(s => s.text && regex.test(s.text));
    }

    // --- STAGE 2: Fuzzy Search (Fuse.js) across Sections ---
    if (foundIndex === -1) {
        const fuse = new Fuse(sections, {
            keys: ['text'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 20
        });
        const results = fuse.search(citation);
        if (results.length > 0) {
            foundIndex = results[0].refIndex;
        }
    }

    if (foundIndex !== -1) {
        const section = sections[foundIndex];
        return {
            sectionId: section.id,
            headerTitle: section.title || section.header || "Section Content",
            contextText: section.text || ""
        };
    }

    return null;
};

/**
 * Splits text into highlight segments.
 * Now with SENTENCE EXPANSION and REFINED FALLBACK.
 */
export const getHighlightSegments = (text, term, def, activeIndex = 0) => {
    if (!text) return [];

    const segments = [];
    const termRegex = createFlexibleRegex(term);
    const defRegex = def ? createFlexibleRegex(def) : null;

    const ranges = [];
    if (defRegex) {
        let m;
        while ((m = defRegex.exec(text)) !== null) {
            ranges.push({ start: m.index, end: m.index + m[0].length, type: 'DEF' });
        }
    }

    let termRanges = [];
    if (termRegex) {
        let m;
        let count = 0;
        while ((m = termRegex.exec(text)) !== null) {
            // [NEW] SENTENCE EXPANSION
            // Expand the match to cover the full sentence
            const { start, end } = expandToSentence(text, m.index, m.index + m[0].length);

            termRanges.push({
                start: start,
                end: end,
                type: 'TERM',
                isActive: count === activeIndex,
                index: count,
                isExpanded: true
            });
            count++;
        }
    }

    // --- REFINED: ROBUST ANCHORED MATCHING FALLBACK ---
    // Only if main regex failed completely
    if (term && termRanges.length === 0) {
        const words = term.split(/[\W_]+/).filter(w => w.length > 3); // Increased min word length to 4 chars

        if (words.length > 0) {
            // Strategy: Create anchors of 4-5 words each (Larger anchors)
            const anchors = [];
            for (let i = 0; i < words.length; i += 4) {
                // Ensure anchor is long enough to be unique-ish
                const chunk = words.slice(i, i + 4);
                if (chunk.join(" ").length > 15) { // Min valid anchor char length
                    anchors.push(chunk.join(" "));
                }
            }

            anchors.forEach((anchor, anchorIdx) => {
                const ar = createFlexibleRegex(anchor);
                if (ar) {
                    let m;
                    // We only want the BEST match for anchors, not scattered ones.
                    // But anchors are partial. Let's just find the first occurrence of each anchor
                    // and verify proximity? Too complex for client.
                    // Simpler: Just highlight the anchors but DO NOT EXPAND scattered ones.
                    // And DO NOT mark them all 'active' aggressively.
                    while ((m = ar.exec(text)) !== null) {
                        termRanges.push({
                            start: m.index,
                            end: m.index + m[0].length,
                            type: 'TERM',
                            isActive: false, // Scattered anchors are passive context
                            index: -1 // Ignored for navigation usually
                        });
                    }
                }
            });
        }
    }

    const points = new Set([0, text.length]);
    ranges.forEach(r => { points.add(r.start); points.add(r.end); });
    termRanges.forEach(r => { points.add(r.start); points.add(r.end); });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const segText = text.slice(start, end);

        const isDef = ranges.some(r => start >= r.start && end <= r.end);
        const termMatch = termRanges.find(r => start >= r.start && end <= r.end);

        segments.push({
            text: segText,
            isDef,
            isTerm: !!termMatch,
            isActive: termMatch?.isActive,
            isStart: termMatch && termMatch.start === start
        });
    }

    return segments;
};

/**
 * LEGACY: Kept for compatibility if needed, but redirects to findCitationInSections
 * if blocks is actually the sections array.
 */
export const findCitationInBlocks = (blocks, citation) => {
    // Detect if this is the new 'sections' array structure
    if (blocks && blocks.length > 0 && (blocks[0].title || blocks[0].analysis)) {
        return findCitationInSections(blocks, citation);
    }

    // Original arbitrary block logic (Deprecated)
    if (!blocks || !citation) return null;
    const targetClean = normalizeText(citation);
    const regex = createFlexibleRegex(citation);
    let foundIndex = blocks.findIndex(b => b.text && normalizeText(b.text).includes(targetClean));
    if (foundIndex === -1 && regex) foundIndex = blocks.findIndex(b => b.text && regex.test(b.text));

    if (foundIndex !== -1) {
        return {
            blockIndex: foundIndex,
            headerTitle: "Context",
            contextText: blocks[foundIndex].text || ""
        };
    }
    return null;
};
