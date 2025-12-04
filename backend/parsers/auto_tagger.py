import re

class AutoTagger:
    def tag(self, content: list, document_type: str = "MASTER"):
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
            
            # 2. PDF Fallback: If ilvl is None, use Regex to detect Headers
            elif ilvl is None:
                if self._is_appendix_header(text):
                    block["type"] = "APPENDIX"
                    block["id"] = f"a_{clause_counter}"
                    clause_counter += 1
                elif document_type == "REFERENCE" and self._is_guideline_header(text):
                     block["type"] = "GUIDELINE"
                     block["id"] = f"g_{clause_counter}"
                     clause_counter += 1
                elif self._is_clause_header(text):
                    block["type"] = "HEADER"
                    block["id"] = f"h_{clause_counter}"
                    clause_counter += 1
                else:
                    # Default to CLAUSE
                    if "id" not in block:
                        block["id"] = f"c_{clause_counter}_{len(tagged_content)}"

            # 3. Appendix/Schedule -> APPENDIX (Already handled in fallback, but kept for safety if ilvl exists but is weird)
            elif self._is_appendix_header(text):
                 block["type"] = "APPENDIX"
                 block["id"] = f"a_{clause_counter}"
                 clause_counter += 1
            
            # 4. Everything else (Subclauses, Text, Tables) -> CLAUSE
            else:
                # Keep existing ID if present, or generate one
                if "id" not in block:
                    block["id"] = f"c_{clause_counter}_{len(tagged_content)}"
            
            tagged_content.append(block)
            
        return tagged_content, document_type

    def _is_clause_header(self, text):
        """
        Heuristics to identify Level 1 headers in plain text (PDF).
        Matches:
        - "1. DEFINITIONS" (Number + Uppercase)
        - "ARTICLE 1" / "SECTION 1"
        - "1.1" is usually NOT a Level 1 header (unless it's the top level style, but standard is 1.)
        """
        # 1. Common Legal Headers: "ARTICLE I", "SECTION 2"
        if re.match(r"^(ARTICLE|SECTION)\s+(\w+|\d+)", text, re.IGNORECASE):
            return True
            
        # 2. Numbered Headers: "1. TITLE" or "1 TITLE"
        # Strict check: Must be short (< 10 words) and usually Uppercase or Title Case
        # Pattern: Start with number, dot (optional), whitespace, then text
        match = re.match(r"^(\d+)\.?\s+([A-Z].*)", text)
        if match:
            # Check length to avoid matching long numbered paragraphs
            if len(text.split()) < 12:
                # Check for sub-clauses like "1.1" - usually we only want "1." for Level 1
                # If the number part contains a dot inside (e.g. "1.1"), it's likely Level 2
                number_part = match.group(1)
                if "." in number_part: 
                     return False # 1.1 is usually subclause
                return True
                
        return False

    def _is_appendix_header(self, text):
        # Matches "Appendix A", "Schedule 1", "Exhibit B", etc.
        # Also matches just "APPENDICES" if it's a standalone header
        if len(text.split()) > 10: # Avoid false positives in long text
            return False
        return bool(re.match(r"^(Appendix|Schedule|Exhibit|Annex)\s+\w+|^(APPENDICES|SCHEDULES|EXHIBITS)$", text, re.IGNORECASE))

    def _is_guideline_header(self, text):
        # Matches "Guideline 1", "Policy A", "Standard 1.2"
        if len(text.split()) > 10:
            return False
        return bool(re.match(r"^(Guideline|Policy|Standard)\s+\w+", text, re.IGNORECASE))
