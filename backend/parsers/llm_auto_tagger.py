import os
import json
import time
import google.generativeai as genai
from dotenv import load_dotenv
from typing import List, Dict, Any, Tuple

# Load environment variables
load_dotenv()

class LLMAutoTagger:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key or api_key == "PLACEHOLDER":
            raise ValueError("GEMINI_API_KEY is missing or invalid in .env file.")
        
        genai.configure(api_key=api_key, transport='rest')
        self.model = genai.GenerativeModel('gemini-2.0-flash', generation_config={"temperature": 0.0})
        
        # Load System Prompt
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "auto_tagger_prompt.txt")
        with open(prompt_path, "r") as f:
            self.base_prompt = f.read()

    def tag(self, content: List[Dict[str, Any]], document_type: str, progress_callback=None) -> Tuple[List[Dict[str, Any]], str]:
        """
        Main entry point.
        1. Use provided Document Type.
        2. Chunk content and classify via LLM.
        3. Merge results and assign IDs.
        """
        if not content:
            return [], document_type

        print(f"Using Document Type: {document_type}")

        # Step 2: Process Chunks
        classified_map = {} # Map index -> type
        
        # DEBUG: Clear log file
        try:
            with open("debug_llm_input.txt", "w", encoding="utf-8") as f:
                f.write("DEBUG LOG STARTED\n")
        except Exception as e:
            print(f"Failed to clear debug log: {e}")
        
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
            response_json = self._classify_chunk_with_retry(llm_input, document_type)
            

            
            # Merge results
            for item in response_json:
                idx = item.get("index")
                tag_type = item.get("type")
                
                if idx is not None and tag_type:
                    # STRICT MERGE RULE: Never overwrite an existing classification.
                    # The first time an index is seen (from the previous chunk), it had more preceding context.
                    # The second time it is seen (as the start of the current chunk), it has less preceding context.
                    if idx not in classified_map:
                        classified_map[idx] = tag_type
            
            # Break if we reached the end
            if chunk_end == total_blocks:
                break
            
            # Rate Limit Protection: Sleep between chunks
            # Rate Limit Protection: Sleep between chunks
            if progress_callback:
                progress_callback(chunk_end, total_blocks)
                
            time.sleep(5)

        # Step 3: Post-Processing (Assign IDs)
        tagged_content = []
        # Step 3: Post-Processing (Assign IDs)
        tagged_content = []
        counters = {
            "INFO": 0, "CLAUSE": 0, "APPENDIX": 0, "ANNEX": 0, "EXHIBIT": 0, "GUIDELINE": 0,
            "INFO_START": 0, "CLAUSE_START": 0, "APPENDIX_START": 0, "ANNEX_START": 0, "EXHIBIT_START": 0, "GUIDELINE_START": 0, "CONTENT": 0
        }
        
        for i, block in enumerate(content):
            tag_type = classified_map.get(i, "CLAUSE") # Default fallback
            
            # Normalize tag if LLM hallucinated
            tag_type = tag_type.upper()
            if tag_type not in counters:
                tag_type = "CLAUSE"

            counters[tag_type] += 1
            
            # Generate ID
            # Map type to prefix
            prefix_map = {
                "INFO": "h",
                "CLAUSE": "c",
                "APPENDIX": "a",
                "ANNEX": "ax",
                "EXHIBIT": "ex",
                "GUIDELINE": "g",
                "INFO_START": "h",
                "CLAUSE_START": "c",
                "APPENDIX_START": "a",
                "ANNEX_START": "ax",
                "EXHIBIT_START": "ex",
                "GUIDELINE_START": "g",
                "CONTENT": "txt"
            }
            prefix = prefix_map.get(tag_type, "c")
            new_id = f"{prefix}_{counters[tag_type]}"
            
            # Update block
            block["type"] = tag_type
            block["id"] = new_id
            tagged_content.append(block)
            
        return tagged_content, document_type

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
            response = self.model.generate_content(prompt)
            result = response.text.strip().upper()
            if result in ["MASTER", "SUBORDINATE", "REFERENCE"]:
                return result
            return "MASTER" # Default
        except Exception as e:
            print(f"Error detecting doc type: {e}")
            return "MASTER"

    def _classify_chunk_with_retry(self, llm_input: List[Dict], document_type: str, max_retries=5) -> List[Dict]:
        """
        Calls LLM to classify a chunk of blocks. Retries if validation fails.
        """
        prompt = f"{self.base_prompt}\n\n"
        prompt += f"CURRENT DOCUMENT TYPE: {document_type}\n"
        prompt += f"INPUT DATA:\n{json.dumps(llm_input)}"
        
        # DEBUG: Save raw input to file
        try:
            with open("debug_llm_input.txt", "a", encoding="utf-8") as f:
                f.write(f"\n\n--- CHUNK START ---\n{prompt}\n--- CHUNK END ---\n")
        except Exception as e:
            print(f"Failed to write debug log: {e}")
        
        backoff = 10 # Start with 10 seconds for 429s
        
        for attempt in range(max_retries):
            try:
                print(f"\n--- Attempt {attempt+1} ---")
                print(f"Sending {len(llm_input)} blocks to LLM...")
                # print(f"Prompt preview: {prompt[:200]}...") 
                
                response = self.model.generate_content(prompt)
                text_response = response.text.strip()
                
                print("LLM Response Received:")
                print(text_response[:500] + "..." if len(text_response) > 500 else text_response)
                print("------------------------\n")
                
                # Clean up markdown code blocks if present
                if text_response.startswith("```json"):
                    text_response = text_response[7:]
                if text_response.endswith("```"):
                    text_response = text_response[:-3]
                
                # DEBUG: Log Response
                try:
                    with open("debug_llm_input.txt", "a", encoding="utf-8") as f:
                        f.write(f"\n--- LLM RESPONSE ---\n{text_response}\n--- END RESPONSE ---\n")
                except Exception as e:
                    print(f"Failed to write debug log: {e}")
                
                data = json.loads(text_response)
                
                # Validation: Check if we got results for all indices
                input_indices = {item['index'] for item in llm_input}
                output_indices = {item.get('index') for item in data}
                
                missing = input_indices - output_indices
                if missing:
                    print(f"Attempt {attempt+1}: Missing indices {missing}. Retrying...")
                    continue
                    
                return data
                
            except Exception as e:
                error_str = str(e)
                print(f"Attempt {attempt+1} failed: {error_str}")
                
                if "429" in error_str:
                    print(f"Rate limit hit. Sleeping for {backoff} seconds...")
                    time.sleep(backoff)
                    backoff *= 2 # Exponential backoff
                else:
                    time.sleep(1) # Standard backoff for other errors
        
        # If all retries fail, return empty list (or fallback logic could be added)
        print("All retries failed for chunk.")
        return []
