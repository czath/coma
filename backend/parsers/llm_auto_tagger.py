import os
import time
import logging
import json
import httpx
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types
from dotenv import load_dotenv

from data_models import ClassificationItem, ClassificationResponse, TagType

load_dotenv()
logger = logging.getLogger(__name__)

class LLMAutoTagger:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is missing or invalid in .env file.")
        
        self.client = genai.Client(
            api_key=self.api_key,
            http_options={
                'api_version': 'v1beta',
                'httpx_client': httpx.Client(verify=False),
                'httpx_async_client': httpx.AsyncClient(verify=False)
            }
        )
        self.model_name = "gemini-2.0-flash"
        
        # Load System Prompt
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "auto_tagger_prompt.txt")
        with open(prompt_path, "r") as f:
            self.base_prompt = f.read()

    def tag(self, content: List[Dict[str, Any]], document_type: str, progress_callback=None) -> Tuple[List[Dict[str, Any]], str]:
        """
        Main entry point.
        """
        if not content:
            return [], document_type

        print(f"Using Document Type: {document_type}")

        # Step 2: Process Chunks
        classified_map = {} # Map index -> type
        
        CHUNK_SIZE = 50
        OVERLAP = 5
        
        total_blocks = len(content)
        
        for i in range(0, total_blocks, CHUNK_SIZE - OVERLAP):
            chunk_end = min(i + CHUNK_SIZE, total_blocks)
            chunk_blocks = content[i:chunk_end]
            
            # Prepare input for LLM
            llm_input = []
            for idx, b in enumerate(chunk_blocks):
                item = {
                    "index": i + idx, 
                    "text": b.get("text", "")
                }
                if "style" in b:
                    item["style"] = b["style"]
                llm_input.append(item)
            
            # Get classifications with retry
            response_items = self._classify_chunk_with_retry(llm_input, document_type)
            
            # Merge results
            for item in response_items:
                id = item.index
                tag_type = item.type.value if item.type else None

                # Fallback for empty type from LLM
                if not tag_type:
                    tag_type = "CLAUSE"

                # STRICT MERGE RULE: Never overwrite
                if id not in classified_map:
                    classified_map[id] = tag_type
            
            if chunk_end == total_blocks:
                break
            
            if progress_callback:
                progress_callback(chunk_end, total_blocks)
                
            time.sleep(2) # Brief sleep to avoid rate limits

        # Step 3: Post-Processing (Assign IDs)
        tagged_content = []
        counters = {
            "INFO": 0, "CLAUSE": 0, "APPENDIX": 0, "ANNEX": 0, "EXHIBIT": 0, "GUIDELINE": 0,
            "CONTENT": 0
        }
        
        # Prefix Map
        prefix_map = {
            "INFO": "h", "CLAUSE": "c", "APPENDIX": "a", "ANNEX": "ax", "EXHIBIT": "ex", "GUIDELINE": "g", "CONTENT": "txt"
        }

        for i, block in enumerate(content):
            tag_type = classified_map.get(i, "CLAUSE") # Default fallback
            
            tag_type = tag_type.upper()
            if "_START" in tag_type: # Handle legacy types if enum didn't catch them
                tag_type = tag_type.replace("_START", "")
            
            if tag_type not in counters:
                tag_type = "CLAUSE"

            counters[tag_type] += 1
            
            prefix = prefix_map.get(tag_type, "c")
            new_id = f"{prefix}_{counters[tag_type]}"
            
            block["type"] = tag_type
            block["id"] = new_id
            tagged_content.append(block)
            
        return tagged_content, document_type

    def _classify_chunk_with_retry(self, llm_input: List[Dict], document_type: str, max_retries=5) -> List[ClassificationItem]:
        """
        Calls LLM to classify a chunk of blocks. Retries if validation fails.
        """
        prompt_content = f"{self.base_prompt}\n\n"
        prompt_content += f"CURRENT DOCUMENT TYPE: {document_type}\n"
        prompt_content += f"INPUT DATA:\n{json.dumps(llm_input)}"
        
        backoff = 5
        
        for attempt in range(max_retries):
            try:
                # Synchronous call for Tagger as per implementation (unless we switch to aio)
                # Note: `self.client.models.generate_content` is sync.
                # `self.client.aio.models.generate_content` is async.
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt_content,
                    config=types.GenerateContentConfig(
                        temperature=0.0,
                        response_mime_type="application/json",
                        response_schema=ClassificationResponse
                    )
                )

                if response.parsed and response.parsed.items:
                    return response.parsed.items
                else:
                    return []

            except Exception as e:
                logger.error(f"Attempt {attempt+1} failed: {e}")
                if "429" in str(e):
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    time.sleep(1)
        
        print("All retries failed for chunk.")
        return []

    def _detect_document_type(self, content: List[Dict]) -> str:
        """
        Analyzes the first 20 blocks to determine document type.
        """
        sample_text = "\n".join([b.get("text", "") for b in content[:20]])
        
        prompt = f"""
        Analyze the following text from the beginning of a legal document.
        Determine if it is a 'MASTER' agreement, a 'SUBORDINATE' agreement (like an SOW or Amendment), or a 'REFERENCE' document (like a policy or guideline).
        
        Text:
        {sample_text[:2000]}
        
        Return ONLY one word: MASTER, SUBORDINATE, or REFERENCE.
        """
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt
            )
            result = response.text.strip().upper()
            if result in ["MASTER", "SUBORDINATE", "REFERENCE"]:
                return result
            return "MASTER"
        except Exception as e:
            print(f"Error detecting doc type: {e}")
            return "MASTER"
