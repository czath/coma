from docx import Document

class DocxParser:
    def extract(self, file_path: str):
        """
        Extracts text from a DOCX file.
        Returns a list of paragraphs with style metadata.
        """
        doc = Document(file_path)
        content = []
        
        for i, para in enumerate(doc.paragraphs):
            text = para.text.strip()
            if text:
                content.append({
                    "id": f"p{i}",
                    "text": text,
                    "style": para.style.name,
                    "origin": "docx"
                })
        return content
