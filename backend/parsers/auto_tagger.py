import re

class AutoTagger:
    def tag(self, content: list):
        """
        Analyzes the content and adds 'type' and 'id' fields.
        Identifies 'CLAUSE' vs 'HEADER' based on heuristics.
        """
        tagged_content = []
        clause_counter = 1
        
        # Regex for common legal numbering (e.g., "1.", "1.1", "Article 1", "Section 2")
        # Also include Appendix, Schedule, Exhibit
        header_pattern = re.compile(r"^((Article|Section|Appendix|Schedule|Exhibit|Annex)\s+\w+|(\d+(\.\d+)*\.?))", re.IGNORECASE)
        
        for block in content:
            text = block.get("text", "").strip()
            
            # Heuristic 1: Regex match for numbering/titles
            # We want to be careful not to match "1. The term..." as a header if it's a list item.
            # Usually headers are short.
            match = header_pattern.match(text)
            is_numbered = bool(match)
            
            # Heuristic 2: Formatting (Bold or All Caps)
            # If it's short and numbered, it's likely a header.
            # If it's short and ALL CAPS, it's likely a header.
            # If it contains "Appendix" or "Schedule", it's definitely a header/appendix start.
            
            is_all_caps = text.isupper() and len(text) > 3
            is_short = len(text.split()) < 15 # Increased word count tolerance
            
            # Specific check for Appendix/Schedule types
            is_appendix = bool(re.match(r"^(Appendix|Schedule|Exhibit|Annex)", text, re.IGNORECASE))

            if (is_numbered or is_all_caps or is_appendix) and is_short:
                if is_appendix:
                    block["type"] = "APPENDIX"
                else:
                    block["type"] = "HEADER"
                block["id"] = f"h_{clause_counter}"
            else:
                block["type"] = "CLAUSE"
                block["id"] = f"c_{clause_counter}"
            
            clause_counter += 1
                
            tagged_content.append(block)
            
        return tagged_content
