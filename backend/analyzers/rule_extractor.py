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
        
        # 1. Prepare Chunks
        # Unlike tagging (where we need strict order), for analysis we can group by sections.
        # However, for simplicity and context, we'll chunk by block count similar to tagging, 
        # but with larger context windows if possible.
        
        CHUNK_SIZE = 20 # Smaller chunks for rule extraction focus? Or larger for context?
                        # Let's stick to ~20-30 blocks to give the LLM enough text to find rules 
                        # but not overfill the window.
        
        total_blocks = len(content)
        aggregated_taxonomy = {} # Map ID -> Object (to deduplicate)
        aggregated_rules = []
        
        chunk_indices = range(0, total_blocks, CHUNK_SIZE)
        total_chunks = len(chunk_indices)
        
        for i, start_idx in enumerate(chunk_indices):
            end_idx = min(start_idx + CHUNK_SIZE, total_blocks)
            chunk_blocks = content[start_idx:end_idx]
            
            # Format text for LLM
            chunk_text = ""
            for block in chunk_blocks:
                # Include ID to help LLM cite source? 
                # Ideally we want the LLM to just cite the text.
                # But for 'source_chunk_id', we might need to map back.
                # For now, let's just pass text. We can match quotes later or just link to the first block of the chunk.
                # Actually, our prompt asks for "verification_quote".
                chunk_text += f"{block.get('text', '')}\n"
                
            # Skip empty chunks
            if not chunk_text.strip():
                continue

            # Call LLM
            try:
                response_json = self._analyze_chunk_with_retry(chunk_text)
                
                # Merge Taxonomy
                for tax in response_json.get("taxonomy", []):
                    # Dedup by tag_id
                    t_id = tax.get("tag_id")
                    if t_id and t_id not in aggregated_taxonomy:
                        aggregated_taxonomy[t_id] = tax
                        
                # Merge Rules
                for rule in response_json.get("rules", []):
                    # Add source metadata
                    # We link the rule to the ID of the first block in this chunk as an approximation,
                    # or leave source_chunk_id generic. 
                    # Better: try to find which specific block contained the quote? 
                    # For now, let's link to the chunk start.
                    if chunk_blocks:
                         rule["source_chunk_id"] = chunk_blocks[0].get("id")
                    
                    aggregated_rules.append(rule)
                    
            except Exception as e:
                print(f"Error analyzing chunk {start_idx}-{end_idx}: {e}")
                # Don't fail the whole process, just log
            
            # Progress
            if progress_callback:
                progress_callback(end_idx, total_blocks)
                
            # Rate Limit Sleep
            time.sleep(2) 
            
        return {
            "taxonomy": list(aggregated_taxonomy.values()),
            "rules": aggregated_rules
        }

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
