{
    ref.is_valid !== false && (ref.target_id || ref.target_header) && (
        <button
            onClick={() => {
                const targetId = ref.target_id || ref.target_section_id;
                if (targetId && file.content) {
                    // Find the ONE block with this ID
                    const targetBlock = file.content.find(b => b.id === targetId);

                    if (targetBlock) {
                        // Display this block's content directly
                        setContextData({
                            type: 'CITATION',
                            citation: ref.target_header || targetId,
                            fullText: targetBlock.text || "",
                            sourceTitle: targetBlock.header || ref.target_header || targetId
                        });
                        setContextSidePaneOpen(true);
                    } else {
                        // ID not found, fallback to header search
                        handleViewContext(ref.target_header, "Target Section");
                    }
                } else if (ref.target_header) {
                    // No ID, use header search
                    handleViewContext(ref.target_header, "Target Section");
                }
            }}
            className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover/target:opacity-100"
            title="Jump to Target"
        >
            <Search size={14} />
        </button>
    )
}
