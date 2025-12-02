import fitz  # PyMuPDF

class PDFParser:
    def extract(self, file_path: str):
        """
        Extracts text and metadata from a PDF file.
        Returns a list of text blocks with bounding box coordinates and font info.
        """
        doc = fitz.open(file_path)
        content = []
        
        for page_num, page in enumerate(doc):
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            text = span["text"].strip()
                            if not text:
                                continue
                                
                            content.append({
                                "text": text,
                                "bbox": span["bbox"],
                                "page": page_num + 1,
                                "size": span["size"],
                                "font": span["font"],
                                "flags": span["flags"], # bold/italic flags
                                "origin": "pdf"
                            })
        return content
