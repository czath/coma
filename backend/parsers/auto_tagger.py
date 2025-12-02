import re

class AutoTagger:
    def tag(self, content: list):
        """
        Analyzes the content and adds 'type' and 'id' fields.
        Uses 'ilvl' from DocxParser to identify Level 1 Clauses (Headers).
        """
        tagged_content = []
        clause_counter = 1
        
        for block in content:
            text = block.get("text", "").strip()
            ilvl = block.get("ilvl")
            
            # Default to CLAUSE (Body Content)
            block["type"] = "CLAUSE"
            
            # 1. Level 1 Numbering -> HEADER (Starts a new section)
            if ilvl == 0:
                block["type"] = "HEADER"
                block["id"] = f"h_{clause_counter}"
                clause_counter += 1
                
            # 2. Appendix/Schedule -> APPENDIX (Starts a new section)
            # Only if it's not already numbered (ilvl is None)
            elif ilvl is None and self._is_appendix_header(text):
                block["type"] = "APPENDIX"
                block["id"] = f"a_{clause_counter}"
                clause_counter += 1
            
            # 3. Everything else (Subclauses, Text, Tables) -> CLAUSE
            else:
                # Keep existing ID if present, or generate one
                if "id" not in block:
                    block["id"] = f"c_{clause_counter}_{len(tagged_content)}"
            
            tagged_content.append(block)
            
        return tagged_content

    def _is_appendix_header(self, text):
        # Matches "Appendix A", "Schedule 1", "Exhibit B", etc.
        # Also matches just "APPENDICES" if it's a standalone header
        if len(text.split()) > 10: # Avoid false positives in long text
            return False
        return bool(re.match(r"^(Appendix|Schedule|Exhibit|Annex)\s+\w+|^(APPENDICES|SCHEDULES|EXHIBITS)$", text, re.IGNORECASE))
