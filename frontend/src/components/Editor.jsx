import React, { useState, useEffect, useRef } from 'react';

export default function Editor({ content, clauses, onUpdateClauses, selectedClauseIds, onSelectClause }) {
    const [contextMenu, setContextMenu] = useState(null);
    const editorRef = useRef(null);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const handleClauseClick = (id, e) => {
        if (e.ctrlKey || e.metaKey) {
            // Toggle selection
            if (selectedClauseIds.includes(id)) {
                onSelectClause(selectedClauseIds.filter(cid => cid !== id));
            } else {
                onSelectClause([...selectedClauseIds, id]);
            }
        } else {
            // Single selection
            onSelectClause([id]);
        }
    };

    // --- Helper: Get Char Index ---
    const getCharIndexFromEvent = (e, lineElement) => {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (!range || !range.startContainer) return 0;

        let node = range.startContainer;
        let offset = range.startOffset;

        // Find closest span with data attributes
        const span = node.nodeType === 3 ? node.parentNode : node;
        const target = span.closest ? span.closest('[data-index], [data-start-index]') : null;

        if (!target) return 0;

        if (target.hasAttribute('data-start-index')) {
            const startIdx = parseInt(target.getAttribute('data-start-index'));

            // If we clicked the text node
            if (node.nodeType === 3) {
                // Handle case where there might be multiple text nodes (unlikely here but good practice)
                let internalOffset = 0;
                let curr = node;
                while (curr.previousSibling) {
                    curr = curr.previousSibling;
                    if (curr.nodeType === 3) internalOffset += curr.length;
                }
                return startIdx + internalOffset + offset;
            }

            // If we clicked the span element itself
            return startIdx;
        }

        if (target.hasAttribute('data-index')) {
            return parseInt(target.getAttribute('data-index'));
        }

        return 0;
    };

    // ... (rest of file)



    const snapToWordBoundary = (text, chIdx, type) => {
        if (!text) return 0;
        if (chIdx < 0) return 0;
        if (chIdx > text.length) return text.length;

        // If already on whitespace, stay there (or move to edge)
        if (/\s/.test(text[chIdx] || ' ')) return chIdx;

        if (type === 'start') {
            let i = chIdx;
            while (i > 0 && /\S/.test(text[i - 1])) i--;
            return i;
        } else {
            // For 'end', if we are at the start of a word, stay there (exclude the word).
            // If we are inside a word, advance to its end (include the word).
            const isStartOfWord = chIdx === 0 || /\s/.test(text[chIdx - 1]);
            if (isStartOfWord) return chIdx;

            let i = chIdx;
            while (i < text.length && /\S/.test(text[i])) i++;
            return i;
        }
    };

    const handleContextMenu = (e, lineIdx) => {
        e.preventDefault();
        e.stopPropagation();

        // Find the line element
        const lineElement = e.currentTarget; // The div with onClick/onContextMenu
        const rawCh = getCharIndexFromEvent(e, lineElement);

        // Helper to compare positions
        const comparePos = (p1, p2) => {
            if (p1.line < p2.line) return -1;
            if (p1.line > p2.line) return 1;
            if (p1.ch < p2.ch) return -1;
            if (p1.ch > p2.ch) return 1;
            return 0;
        };

        // Check if point is inside an existing clause
        const point = { line: lineIdx, ch: rawCh };
        const existingClause = clauses.find(c => {
            if (!c.end) return false;
            return comparePos(c.start, point) <= 0 && comparePos(point, c.end) < 0;
        });

        // Check for unterminated clause
        const unterminated = clauses.find(c => !c.end);

        // If clicked on a clause that is NOT selected, select it (single)
        // If clicked on a clause that IS selected, keep selection (to allow context menu on multi-selection)
        if (existingClause) {
            if (!selectedClauseIds.includes(existingClause.id)) {
                onSelectClause([existingClause.id]);
            }
        } else {
            onSelectClause([]);
        }

        setContextMenu({
            x: e.pageX,
            y: e.pageY,
            lineIdx,
            rawCh,
            unterminated,
            existingClause
        });
    };

    const handleAction = (action, payload) => {
        if (!contextMenu && action !== 'delete') return;

        if (action === 'delete') {
            // If payload is provided (from sidebar maybe?), use it.
            // Otherwise use selectedClauseIds if available, or contextMenu target.
            let idsToDelete = [];
            if (payload) {
                idsToDelete = [payload];
            } else if (selectedClauseIds.length > 0) {
                idsToDelete = selectedClauseIds;
            } else if (contextMenu && contextMenu.existingClause) {
                idsToDelete = [contextMenu.existingClause.id];
            }

            if (idsToDelete.length > 0) {
                const newClauses = clauses.filter(c => !idsToDelete.includes(c.id));
                onUpdateClauses(newClauses);
                onSelectClause([]);
            }
            setContextMenu(null);
            return;
        }

        if (action === 'merge') {
            if (selectedClauseIds.length < 2) {
                alert("Select at least 2 sections to merge.");
                return;
            }

            const selectedClauses = clauses.filter(c => selectedClauseIds.includes(c.id));
            // Find min start and max end
            // We need a robust compare
            const comparePos = (p1, p2) => {
                if (p1.line < p2.line) return -1;
                if (p1.line > p2.line) return 1;
                if (p1.ch < p2.ch) return -1;
                if (p1.ch > p2.ch) return 1;
                return 0;
            };

            let minStart = selectedClauses[0].start;
            let maxEnd = selectedClauses[0].end;

            selectedClauses.forEach(c => {
                if (comparePos(c.start, minStart) < 0) minStart = c.start;
                if (c.end && comparePos(c.end, maxEnd) > 0) maxEnd = c.end;
            });

            // Find ALL clauses that are within this range (to absorb them)
            // A clause is "inside" if its start >= minStart AND its end <= maxEnd
            const clausesToAbsorb = clauses.filter(c => {
                if (!c.end) return false;
                return comparePos(c.start, minStart) >= 0 && comparePos(c.end, maxEnd) <= 0;
            });

            const idsToAbsorb = clausesToAbsorb.map(c => c.id);

            const newId = 'c' + Date.now();
            const newClause = {
                id: newId,
                type: 'CLAUSE',
                header: 'Merged Section',
                start: minStart,
                end: maxEnd,
                tags: []
            };

            // Remove absorbed clauses, add new merged clause
            const newClauses = clauses.filter(c => !idsToAbsorb.includes(c.id));
            newClauses.push(newClause);

            onUpdateClauses(newClauses);
            onSelectClause([newId]);
            setContextMenu(null);
            return;
        }

        const { lineIdx, rawCh, unterminated } = contextMenu;
        const text = content[lineIdx].text;

        // Helper to compare positions: -1 if p1 < p2, 0 if p1 == p2, 1 if p1 > p2
        const comparePos = (p1, p2) => {
            if (p1.line < p2.line) return -1;
            if (p1.line > p2.line) return 1;
            if (p1.ch < p2.ch) return -1;
            if (p1.ch > p2.ch) return 1;
            return 0;
        };

        // Helper to check if a point is strictly inside a clause range
        const isInside = (point, clause) => {
            if (!clause.end) return false; // Unterminated clauses don't have a closed range yet
            return comparePos(clause.start, point) <= 0 && comparePos(point, clause.end) < 0;
        };

        if (action === 'start') {
            if (unterminated) {
                alert("Please close the current section before starting a new one.");
                return;
            }
            const ch = snapToWordBoundary(text, rawCh, 'start');
            const startPoint = { line: lineIdx, ch };

            // Check if start point is inside any existing clause
            const overlapping = clauses.find(c => isInside(startPoint, c));
            if (overlapping) {
                alert("Cannot start a new section inside an existing section.");
                return;
            }

            const newId = 'c' + Date.now();
            const newClause = {
                id: newId,
                type: 'CLAUSE',
                header: 'New Section',
                start: startPoint,
                end: null,
                tags: []
            };
            onUpdateClauses([...clauses, newClause]);
            onSelectClause(newId);
        } else if (action === 'end') {
            if (!unterminated) return;

            const ch = snapToWordBoundary(text, rawCh, 'end');
            const endPoint = { line: lineIdx, ch };

            // Validation: End must be after Start
            if (comparePos(unterminated.start, endPoint) >= 0) {
                alert("End position must be after start position.");
                return;
            }

            // Check if the new range overlaps with any other clause
            // Overlap condition: (StartA < EndB) and (EndA > StartB)
            const hasOverlap = clauses.some(c => {
                if (c.id === unterminated.id) return false; // Skip self
                if (!c.end) return false; // Skip other unterminated (shouldn't exist)

                // Check intersection
                const startA = unterminated.start;
                const endA = endPoint;
                const startB = c.start;
                const endB = c.end;

                return comparePos(startA, endB) < 0 && comparePos(endA, startB) > 0;
            });

            if (hasOverlap) {
                alert("Cannot end section here because it would overlap with another section.");
                return;
            }

            const updated = clauses.map(c => {
                if (c.id === unterminated.id) {
                    return { ...c, end: endPoint };
                }
                return c;
            });
            onUpdateClauses(updated);
        }
        setContextMenu(null);
    };

    return (
        <div className="flex-grow flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
                <h2 className="text-sm font-bold text-gray-700 uppercase">Document Editor</h2>
                <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded">Right-click text to Tag</span>
            </div>

            <div className="flex-grow overflow-y-auto p-8 cursor-text font-mono text-sm leading-loose" ref={editorRef}>
                {content.map((block, idx) => (
                    <Line
                        key={idx}
                        block={block}
                        lineIdx={idx}
                        clauses={clauses}
                        selectedClauseIds={selectedClauseIds}
                        onContextMenu={handleContextMenu}
                        onSelectClause={handleClauseClick}
                    />
                ))}
            </div>

            {contextMenu && (
                <div
                    className="absolute bg-white border border-gray-200 shadow-lg rounded-md py-1 z-50 w-56"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b">Actions</div>

                    {selectedClauseIds.length > 1 ? (
                        <>
                            <button
                                className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-gray-700 font-medium"
                                onClick={() => handleAction('merge')}
                            >
                                Merge to One
                            </button>
                            <button
                                className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600 font-medium"
                                onClick={() => handleAction('delete')}
                            >
                                Delete All ({selectedClauseIds.length})
                            </button>
                        </>
                    ) : contextMenu.existingClause ? (
                        <button
                            className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600 font-medium"
                            onClick={() => handleAction('delete')}
                        >
                            Delete Section
                        </button>
                    ) : contextMenu.unterminated ? (
                        <>
                            <div className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-b border-amber-100">
                                ⚠ Section in progress: <br /><strong>{contextMenu.unterminated.header}</strong>
                            </div>
                            <button
                                className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-gray-700 font-medium"
                                onClick={() => handleAction('end')}
                            >
                                End Section Here
                            </button>
                        </>
                    ) : (
                        <button
                            className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm text-gray-700 font-medium"
                            onClick={() => handleAction('start')}
                        >
                            Start New Section Here
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function Line({ block, lineIdx, clauses, selectedClauseIds, onContextMenu, onSelectClause }) {
    const text = block.text;

    // 1. Collect all interesting points (start/end of clauses) on this line
    let points = [{ idx: 0, type: 'virtual' }, { idx: text.length, type: 'virtual' }];

    clauses.forEach(c => {
        // Clamp indices to text length to ensure they are within bounds
        if (c.start.line === lineIdx) points.push({ idx: Math.min(c.start.ch, text.length), type: 'start', clause: c });
        if (c.end && c.end.line === lineIdx) points.push({ idx: Math.min(c.end.ch, text.length), type: 'end', clause: c });
    });

    // Sort points
    points.sort((a, b) => a.idx - b.idx);

    // 2. Render segments
    const segments = [];

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        // Find next point that has a different index (or is the last one)
        let j = i + 1;
        while (j < points.length && points[j].idx === p1.idx) j++;
        if (j >= points.length) break; // End of line

        const p2 = points[j]; // This is the start of the NEXT segment

        // Events at p1.idx
        const eventsAtP1 = points.filter(p => p.idx === p1.idx && p.type !== 'virtual');

        // Render pills for events at this position
        eventsAtP1.forEach(p => {
            if (p.type === 'start') {
                const isActive = selectedClauseIds.includes(p.clause.id);
                const isUnterminated = !p.clause.end;
                const colorClass = isUnterminated ? 'bg-amber-500 animate-pulse' : 'bg-blue-500';

                const headerText = p.clause.header ? `: ${p.clause.header}` : '';
                const label = isUnterminated ? `⚠ ${p.clause.type}${headerText}` : `${p.clause.type}${headerText}`;

                segments.push(
                    <span
                        key={`${p.clause.id}-start`}
                        data-index={p.idx}
                        className={`inline-flex items-center px-1 rounded-l text-white text-xs font-bold mr-[1px] cursor-pointer select-none ${colorClass} ${isActive ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onSelectClause(p.clause.id, e); }}
                        title={isUnterminated ? "Section In Progress (Unterminated)" : p.clause.header}
                    >
                        {label}
                    </span>
                );

                // Render Tags
                if (p.clause.tags && p.clause.tags.length > 0) {
                    p.clause.tags.forEach((tag, tIdx) => {
                        segments.push(
                            <span
                                key={`${p.clause.id}-tag-${tIdx}`}
                                data-index={p.idx}
                                className="inline-flex items-center px-1 border border-gray-300 bg-gray-100 text-gray-600 text-[10px] font-semibold mr-[1px] select-none"
                            >
                                {tag}
                            </span>
                        );
                    });
                }

            } else if (p.type === 'end') {
                segments.push(
                    <span
                        key={`${p.clause.id}-end`}
                        data-index={p.idx}
                        className="inline-flex items-center px-1 rounded-r text-white text-xs font-bold ml-[1px] bg-red-500 cursor-pointer select-none"
                        onClick={(e) => { e.stopPropagation(); onSelectClause(p.clause.id, e); }}
                    >
                        END
                    </span>
                );
            }
        });

        // Render text segment from p1.idx to p2.idx
        const segmentText = text.substring(p1.idx, p2.idx);
        if (segmentText) {
            // Determine if this segment is inside any clause
            const coveringClause = clauses.find(c => {
                if (!c.end) return false;
                const startsBefore = (c.start.line < lineIdx) || (c.start.line === lineIdx && c.start.ch <= p1.idx);
                const endsAfter = (c.end.line > lineIdx) || (c.end.line === lineIdx && c.end.ch >= p2.idx);
                return startsBefore && endsAfter;
            });

            const isActive = coveringClause && selectedClauseIds.includes(coveringClause.id);

            segments.push(
                <span
                    key={`text-${p1.idx}`}
                    data-start-index={p1.idx}
                    className={`${coveringClause ? 'bg-blue-50 border-b-2 border-blue-200' : ''} ${isActive ? 'bg-blue-100 border-blue-500' : ''}`}
                    onClick={(e) => {
                        if (coveringClause) {
                            e.stopPropagation();
                            onSelectClause(coveringClause.id, e);
                        }
                    }}
                >
                    {segmentText}
                </span>
            );
        }

        // Move i to j-1 so next loop starts at j
        i = j - 1;
    }

    // Handle events at the very end of the line
    const lastIdx = text.length;
    const eventsAtEnd = points.filter(p => p.idx === lastIdx && p.type !== 'virtual');
    eventsAtEnd.forEach(p => {
        if (p.type === 'end') {
            segments.push(
                <span
                    key={`${p.clause.id}-end-line`}
                    data-index={lastIdx}
                    className="inline-flex items-center px-1 rounded-r text-white text-xs font-bold ml-[1px] bg-red-500 cursor-pointer select-none"
                    onClick={(e) => { e.stopPropagation(); onSelectClause(p.clause.id, e); }}
                >
                    END
                </span>
            );
        }
    });

    return (
        <div
            className="py-1 hover:bg-gray-50 relative"
            onContextMenu={(e) => onContextMenu(e, lineIdx)}
        >
            {segments}
        </div>
    );
}
