import os
import json
import time
import google.generativeai as genai
from typing import List, Dict, Any, Tuple
from config_llm import get_config

class RuleExtractor:
    def __init__(self):
        # Load Config for Analysis
        self.config = get_config("ANALYSIS")
        
        # Initialize Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is missing.")
        
        genai.configure(api_key=api_key, transport='rest')
        self.model = genai.GenerativeModel(
            self.config["model_name"],
            generation_config={
                "temperature": self.config["temperature"],
                "max_output_tokens": self.config.get("max_output_tokens", 8192)
            }
        )
        
        # Load Phrase Prompt
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "analysis_prompt.txt")
        try:
            with open(prompt_path, "r", encoding="utf-8") as f:
                self.base_prompt = f.read()
        except FileNotFoundError:
             raise FileNotFoundError(f"Analysis prompt not found at {prompt_path}")

    def extract(self, content: List[Dict[str, Any]], progress_callback=None) -> Dict[str, Any]:
        """
        Iterates through content chunks and extracts Taxonomy + Rules.
        """
        
        # 1. Pre-process: Map every block key to its Parent Header
        # This allows us to link a Rule -> Quote -> Block -> Parent Section ID/Title
        block_header_map = self._build_header_map(content)
        
        # 2. Prepare Chunks
        CHUNK_SIZE = 20
        total_blocks = len(content)
        aggregated_taxonomy = {} 
        aggregated_rules = []
        
        chunk_indices = range(0, total_blocks, CHUNK_SIZE)
        
        for i, start_idx in enumerate(chunk_indices):
            end_idx = min(start_idx + CHUNK_SIZE, total_blocks)
            chunk_blocks = content[start_idx:end_idx]
            
            # Format text for LLM
            chunk_text = ""
            for block in chunk_blocks:
                chunk_text += f"{block.get('text', '')}\n"
                
            if not chunk_text.strip():
                continue

            # Call LLM
            try:
                response_json = self._analyze_chunk_with_retry(chunk_text)
                
                # Merge Taxonomy
                for tax in response_json.get("taxonomy", []):
                    t_id = tax.get("tag_id")
                    if t_id and t_id not in aggregated_taxonomy:
                        aggregated_taxonomy[t_id] = tax
                        
                # Merge Rules
                for rule in response_json.get("rules", []):
                    # Smart Attribution: Find which block contains the quote
                    quote = rule.get("verification_quote", "").strip()
                    matched_header = None
                    
                    if quote:
                        # Search in current chunk blocks
                        for b_idx, block in enumerate(chunk_blocks):
                            if quote in block.get("text", ""):
                                # Found the source block!
                                global_idx = start_idx + b_idx
                                matched_header = block_header_map.get(global_idx)
                                break
                    
                    # Fallback: Use the header of the first block in chunk
                    if not matched_header and chunk_blocks:
                         global_idx = start_idx
                         matched_header = block_header_map.get(global_idx)

                    # Assign Source Metadata
                    if matched_header:
                        rule["source_id"] = matched_header["id"]
                        rule["source_header"] = matched_header["text"]
                    else:
                        rule["source_id"] = "unknown"
                        rule["source_header"] = "Unknown Section"

                    aggregated_rules.append(rule)
                    
            except Exception as e:
                print(f"Error analyzing chunk {start_idx}-{end_idx}: {e}")
            
            if progress_callback:
                progress_callback(end_idx, total_blocks)
            time.sleep(2) 
            
        return {
            "taxonomy": list(aggregated_taxonomy.values()),
            "rules": aggregated_rules
        }

    def _build_header_map(self, content: List[Dict]) -> Dict[int, Dict]:
        """
        Scans content to determine the active "Parent Header" for every block index.
        Returns: { block_index: { "id": "h_1", "text": "1. Definitions" } }
        """
        header_map = {}
        current_header = {"id": "root", "text": "Document Start"}
        
        for idx, block in enumerate(content):
            # Check if this block IS a header
            # Types: CLAUSE_START, GUIDELINE, APPENDIX, or if ID starts with h_, g_, a_
            b_type = block.get("type", "CLAUSE")
            b_id = block.get("id", "")
            
            is_header = False
            if b_type in ["CLAUSE_START", "GUIDELINE", "APPENDIX", "ANNEX", "EXHIBIT"]:
                is_header = True
            elif b_id.startswith(("h_", "g_", "a_")):
                is_header = True
                
            if is_header:
                # Update current header context (using 50 chars max for title)
                title = block.get("text", "").strip()
                if len(title) > 60: title = title[:57] + "..."
                current_header = {"id": b_id, "text": title}
            
            header_map[idx] = current_header
            
        return header_map

    def _analyze_chunk_with_retry(self, text: str, max_retries=3) -> Dict:
        """
        Standard LLM call with retry and JSON parsing.
        """
        prompt = f"{self.base_prompt}\n\n### TARGET TEXT\n{text}"
        
        for attempt in range(max_retries):
            try:
                response = self.model.generate_content(prompt)
                raw_text = response.text.strip()
                
                # Clean Markdown
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                    
                return json.loads(raw_text)
                
            except Exception as e:
                print(f"LLM Attempt {attempt+1} failed: {e}")
                time.sleep(2 * (attempt + 1))
        
        return {"taxonomy": [], "rules": []} # Fallback
