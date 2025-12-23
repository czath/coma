import fitz  # PyMuPDF

class PDFParser:
    def extract(self, file_path: str):
        """
        Extracts text from a PDF file using block-level extraction.
        Removes headers and footers based on geometric heuristics.
        Returns a list of text blocks.
        """
        with fitz.open(file_path) as doc:
            content = []
            
            # Heuristic: Ignore text in top 10% and bottom 10% of the page
            HEADER_THRESHOLD = 0.10
            FOOTER_THRESHOLD = 0.90

            for page_num, page in enumerate(doc):
                page_height = page.rect.height
                
                # Get text blocks: (x0, y0, x1, y1, "text", block_no, block_type)
                blocks = page.get_text("blocks")
                
                # Sort blocks by vertical position (y0), then horizontal (x0)
                blocks.sort(key=lambda b: (b[1], b[0]))
                
                for b in blocks:
                    # b[4] is the text content
                    text = b[4].strip()
                    if not text:
                        continue
                        
                    # Geometric filtering for Header/Footer
                    y0, y1 = b[1], b[3]
                    
                    # Check if block is in the header region
                    if y1 < page_height * HEADER_THRESHOLD:
                        continue
                        
                    # Check if block is in the footer region
                    if y0 > page_height * FOOTER_THRESHOLD:
                        continue
                    
                    # Clean up text: replace internal newlines with spaces to merge lines
                    cleaned_text = " ".join(line.strip() for line in text.split('\n') if line.strip())
                    
                    content.append({
                        "text": cleaned_text,
                        "bbox": (b[0], b[1], b[2], b[3]),
                        "page": page_num + 1,
                        "type": "CLAUSE", # Default type, AutoTagger will refine
                        "ilvl": None,      # PDF doesn't have structure levels, AutoTagger will use regex
                        "origin": "pdf"
                    })
                
            return content
