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
export const createFlexibleRegex = (text) => {
    if (!text) return null;
    const cleanText = text.trim();
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const escapedParts = cleanText
        .split(/[\s\n\u00A0]+/)
        .filter(part => part.length > 0)
        .map(part => escapeRegExp(part));

    let pattern = escapedParts.join("[\\s\\n\\u00A0]+");

    if (/^\w/.test(cleanText)) pattern = `\\b${pattern}`;
    if (/\w$/.test(cleanText)) pattern = `${pattern}\\b`;

    return new RegExp(pattern, 'gi');
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
 * Now with ROBUST FALLBACK for fuzzy citations.
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
            termRanges.push({
                start: m.index,
                end: m.index + m[0].length,
                type: 'TERM',
                isActive: count === activeIndex,
                index: count
            });
            count++;
        }
    }

    // --- NEW: ROBUST ANCHORED MATCHING FALLBACK ---
    // If no ranges found for the term, try matching "anchors" (word chunks)
    if (term && termRanges.length === 0) {
        const words = term.split(/[\s\n\u00A0]+/).filter(w => w.length > 2);

        if (words.length > 0) {
            // Strategy: Create anchors of 3-4 words each
            const anchors = [];
            for (let i = 0; i < words.length; i += 3) {
                anchors.push(words.slice(i, i + 3).join(" "));
            }

            anchors.forEach((anchor, anchorIdx) => {
                const ar = createFlexibleRegex(anchor);
                if (ar) {
                    let m;
                    while ((m = ar.exec(text)) !== null) {
                        termRanges.push({
                            start: m.index,
                            end: m.index + m[0].length,
                            type: 'TERM',
                            isActive: true, // For anchors, we treat all as active to show the "coverage"
                            index: anchorIdx
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
