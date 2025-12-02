from docx import Document
from docx.oxml.ns import qn

class DocxParser:
    def _get_numbering_map(self, doc):
        """
        Builds a map of numId -> abstractNumId and abstractNumId -> level formats.
        """
        numbering_part = doc.part.numbering_part
        if not numbering_part:
            return {}, {}

        # Map numId to abstractNumId
        num_id_map = {}
        for num in numbering_part.element.xpath(".//w:num"):
            num_id = num.get(qn("w:numId"))
            abstract_num_id_element = num.find(qn("w:abstractNumId"))
            if abstract_num_id_element is not None:
                abstract_num_id = abstract_num_id_element.get(qn("w:val"))
                num_id_map[int(num_id)] = int(abstract_num_id)

        # Map abstractNumId to level formats
        abstract_num_map = {}
        for abstract_num in numbering_part.element.xpath(".//w:abstractNum"):
            abstract_num_id = int(abstract_num.get(qn("w:abstractNumId")))
            levels = {}
            for lvl in abstract_num.findall(qn("w:lvl")):
                ilvl = int(lvl.get(qn("w:ilvl")))
                num_fmt_element = lvl.find(qn("w:numFmt"))
                start_element = lvl.find(qn("w:start"))
                lvl_text_element = lvl.find(qn("w:lvlText"))
                
                fmt = num_fmt_element.get(qn("w:val")) if num_fmt_element is not None else "decimal"
                start = int(start_element.get(qn("w:val"))) if start_element is not None else 1
                lvl_text = lvl_text_element.get(qn("w:val")) if lvl_text_element is not None else "%1."
                
                levels[ilvl] = {
                    "fmt": fmt,
                    "start": start,
                    "lvlText": lvl_text
                }
            abstract_num_map[abstract_num_id] = levels

        return num_id_map, abstract_num_map

    def _get_style_numbering_map(self, doc):
        """
        Builds a map of styleId -> numPr element.
        """
        try:
            styles_element = doc.styles.element
        except AttributeError:
            return {}
            
        style_num_map = {}
        for style in styles_element.xpath(".//w:style"):
            style_id = style.get(qn("w:styleId"))
            p_pr = style.find(qn("w:pPr"))
            if p_pr is not None:
                num_pr = p_pr.find(qn("w:numPr"))
                if num_pr is not None:
                    style_num_map[style_id] = num_pr
        return style_num_map

    def _format_number(self, fmt, value):
        if fmt == "decimal":
            return str(value)
        elif fmt == "lowerLetter":
            return chr(96 + value) if 1 <= value <= 26 else str(value)
        elif fmt == "upperLetter":
            return chr(64 + value) if 1 <= value <= 26 else str(value)
        elif fmt == "lowerRoman":
            val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
            syb = ["m", "cm", "d", "cd", "c", "xc", "l", "xl", "x", "ix", "v", "iv", "i"]
            roman_num = ''
            i = 0
            num = value
            while num > 0:
                for _ in range(num // val[i]):
                    roman_num += syb[i]
                    num -= val[i]
                i += 1
            return roman_num
        elif fmt == "upperRoman":
            return self._format_number("lowerRoman", value).upper()
        elif fmt == "bullet":
            return "•"
        else:
            return str(value)

    def extract(self, file_path: str):
        """
        Extracts text from a DOCX file, including numbering and tables.
        """
        doc = Document(file_path)
        content = []
        
        num_id_map, abstract_num_map = self._get_numbering_map(doc)
        style_num_map = self._get_style_numbering_map(doc)
        counters = {}

        # Helper to process a paragraph
        def process_paragraph(para, index_prefix):
            text = para.text.strip()
            if not text:
                return

            # Resolve Numbering
            num_pr = para._element.find(qn("w:numPr"))
            if num_pr is None and para.style:
                style_id = para.style.style_id
                if style_id in style_num_map:
                    num_pr = style_num_map[style_id]
            
            ilvl = None # Default
            if num_pr is not None:
                num_id_element = num_pr.find(qn("w:numId"))
                ilvl_element = num_pr.find(qn("w:ilvl"))
                
                if num_id_element is not None:
                    num_id = int(num_id_element.get(qn("w:val")))
                    ilvl = int(ilvl_element.get(qn("w:val"))) if ilvl_element is not None else 0
                    
                    if num_id in num_id_map:
                        abstract_num_id = num_id_map[num_id]
                        if abstract_num_id in abstract_num_map:
                            levels = abstract_num_map[abstract_num_id]
                            if ilvl in levels:
                                level_def = levels[ilvl]
                                
                                if num_id not in counters:
                                    counters[num_id] = {}
                                
                                if ilvl not in counters[num_id]:
                                    counters[num_id][ilvl] = level_def["start"]
                                else:
                                    counters[num_id][ilvl] += 1
                                    
                                keys_to_reset = [k for k in counters[num_id] if k > ilvl]
                                for k in keys_to_reset:
                                    del counters[num_id][k]
                                    
                                lvl_text = level_def["lvlText"]
                                formatted_label = lvl_text
                                
                                for l in range(ilvl + 1):
                                    val = counters[num_id].get(l, levels.get(l, {}).get("start", 1))
                                    fmt = levels.get(l, {}).get("fmt", "decimal")
                                    formatted_val = self._format_number(fmt, val)
                                    formatted_label = formatted_label.replace(f"%{l+1}", formatted_val)
                                
                                text = f"{formatted_label}\t{text}"

            content.append({
                "id": f"{index_prefix}",
                "text": text,
                "ilvl": ilvl, # Pass ilvl to AutoTagger
                "style": para.style.name if hasattr(para, 'style') and para.style else "Normal",
                "origin": "docx"
            })

        # Iterate through all elements in the document body to preserve order
        for i, element in enumerate(doc.element.body):
            if element.tag.endswith('p'):  # Paragraph
                from docx.text.paragraph import Paragraph
                para = Paragraph(element, doc)
                process_paragraph(para, f"p{i}")
                
            elif element.tag.endswith('tbl'):  # Table
                from docx.table import Table
                table = Table(element, doc)
                
                table_rows = []
                max_cols = 0
                
                # First pass: collect text and find max columns
                for row in table.rows:
                    row_data = []
                    for cell in row.cells:
                        row_data.append(cell.text.strip())
                    table_rows.append(row_data)
                    max_cols = max(max_cols, len(row_data))
                
                if table_rows:
                    markdown_lines = []
                    
                    # Helper to format a row
                    def format_row(row_data):
                        padded = row_data + [""] * (max_cols - len(row_data))
                        escaped = [c.replace("|", "\\|").replace("\n", "<br>") for c in padded]
                        return "| " + " | ".join(escaped) + " |"

                    # Header
                    markdown_lines.append(format_row(table_rows[0]))
                    
                    # Separator
                    markdown_lines.append("| " + " | ".join(["---"] * max_cols) + " |")
                    
                    # Data rows
                    for row_data in table_rows[1:]:
                        markdown_lines.append(format_row(row_data))
                    
                    full_table_text = "\n".join(markdown_lines)
                    
                    content.append({
                        "id": f"tbl{i}",
                        "text": full_table_text,
                        "ilvl": None,
                        "style": "Table",
                        "origin": "docx"
                    })
        return content
