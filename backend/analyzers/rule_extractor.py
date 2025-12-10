import os
import asyncio
import logging
import httpx
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Import Pydantic models
from data_models import AnalysisResponse, Rule, Term
from config_llm import get_config

load_dotenv()
logger = logging.getLogger(__name__)

class RuleExtractor:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")

        self.client = genai.Client(
            api_key=self.api_key,
            http_options={
                'api_version': 'v1beta',
                'httpx_client': httpx.Client(verify=False),
                'httpx_async_client': httpx.AsyncClient(verify=False)
            }
        )
        
        # Load Config
        self.config = get_config("ANALYSIS")
        self.model_name = self.config["model_name"]
        
        # Load System Prompt
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "analysis_prompt.txt")
        with open(prompt_path, "r") as f:
            self.base_prompt = f.read()

    async def extract(self, content_blocks: List[Dict[str, Any]], progress_callback=None) -> Dict[str, Any]:
        """
        Main extraction method using Section-Based Analysis concurrently.
        """
        # 1. Group content by "logical sections"
        sections = self._group_by_section(content_blocks)
        total_sections = len(sections)
        
        all_rules = []
        all_taxonomy = []
        
        # Semaphore to limit concurrent LLM calls
        sem = asyncio.Semaphore(5)
        
        async def process_section(section):
            async with sem:
                section_text = "\n".join([b.get("text", "") for b in section])
                # Skip empty sections
                if not section_text.strip():
                    return None
                
                # Identify known header from the first block of the section
                header_text = "Unknown Section"
                known_header_types = {
                    "CLAUSE", "APPENDIX", "ANNEX", "EXHIBIT", "GUIDELINE", "INFO",
                    "CLAUSE_START", "APPENDIX_START", "ANNEX_START", "EXHIBIT_START", "GUIDELINE_START", "INFO_START"
                }

                if section:
                    first_block = section[0]
                    first_type = first_block.get("type", "").upper()
                    if first_type in known_header_types:
                        header_text = first_block.get("text", "Unknown Section")
                    
                    print(f"DEBUG: Section First Block Type: {first_type}, Identified Header: {header_text}")
                
                logger.info(f"Processing Section with Header: {header_text}")

                # CHUNKING LOGIC FOR LARGE SECTIONS
                MAX_SECTION_CHARS = 12000 
                merged_response = AnalysisResponse(taxonomy=[], rules=[]) # Accumulator

                # Get Source ID (First Block ID)
                source_id = None
                if section:
                     source_id = section[0].get("id")

                if len(section_text) > MAX_SECTION_CHARS:
                    logger.info(f"Section size {len(section_text)} exceeds limit. Splitting into chunks.")
                    chunks = []
                    start = 0
                    while start < len(section_text):
                        # Ensure we don't exceed remaining text
                        end = min(start + MAX_SECTION_CHARS, len(section_text))
                        
                        # Only look for newline if we are NOT at end of text (i.e. we are splitting via limit)
                        if end < len(section_text):
                            # Look for newline in the valid chunk range [start, end]
                            # But prefer newlines closer to the 'end' than 'start' to maximize chunk size
                            # Ensure we don't accidentally set end=start if newline is at start
                            last_newline = section_text.rfind('\n', start, end)
                            
                            # Valid newline logic: must be found AND must be past the midpoint (or reasonable minimum) 
                            # to avoid infinite loops or tiny chunks.
                            # Using start + 1000 ensures we advance at least 1000 chars if possible
                            if last_newline != -1 and last_newline > (start + 1000):
                                end = last_newline

                        chunk = section_text[start:end]
                        if not chunk: # Safety for infinite loop
                            break
                            
                        chunks.append(chunk)
                        start = end
                    
                    # Process chunks SERIALLY
                    for i, chunk in enumerate(chunks):
                        logger.info(f"Processing chunk {i+1}/{len(chunks)} of section...")
                        res = await self._analyze_section_with_retry(chunk)
                        if res:
                            for r in res.rules:
                                r.source_header = header_text
                                r.source_id = source_id # Assign Source ID
                            merged_response.taxonomy.extend(res.taxonomy)
                            merged_response.rules.extend(res.rules)
                    
                    return merged_response
                else:
                    res = await self._analyze_section_with_retry(section_text)
                    if res:
                        for r in res.rules:
                            r.source_header = header_text
                            r.source_id = source_id # Assign Source ID
                    return res

        # Create tasks
        tasks = [process_section(section) for section in sections]
        
        # Run tasks and update progress
        completed_count = 0
        for future in asyncio.as_completed(tasks):
            result = await future
            completed_count += 1
            if progress_callback:
                progress_callback(completed_count, total_sections)
            
            if result:
                all_rules.extend(result.rules)
                all_taxonomy.extend(result.taxonomy)

        # Deduplicate Taxonomy
        unique_taxonomy = {t.term: t for t in all_taxonomy}.values()

        return {
            "taxonomy": [t.model_dump() for t in unique_taxonomy],
            "rules": [r.model_dump() for r in all_rules]
        }

    async def _analyze_section_with_retry(self, section_text: str, max_retries: int = 5) -> Optional[AnalysisResponse]:
        """
        Analyzes a single section using the new SDK's Structured Output capability.
        """
        backoff = 2
        
        for attempt in range(max_retries):
            try:
                # Call the Async Client
                response = await self.client.aio.models.generate_content(
                    model=self.model_name,
                    contents=[self.base_prompt, section_text],
                    config=types.GenerateContentConfig(
                        temperature=self.config.get("temperature", 0.0),
                        top_p=self.config.get("top_p", 0.95),
                        top_k=self.config.get("top_k", 1),
                        response_mime_type="application/json",
                        response_schema=AnalysisResponse
                    )
                )

                if response.parsed:
                    return response.parsed
                else:
                    logger.warning(f"Empty parsed response for section length {len(section_text)}.")
                    try:
                        logger.warning(f"Finish Reason: {response.candidates[0].finish_reason}")
                        logger.warning(f"Raw Text: {response.text}")
                    except Exception:
                        logger.warning("Could not read finish_reason or text.")
                    return None

            except Exception as e:
                logger.error(f"Attempt {attempt+1} failed: {e}")
                if "429" in str(e):
                    await asyncio.sleep(backoff)
                    backoff *= 2
                else:
                    await asyncio.sleep(1)
        
        logger.error(f"Failed to analyze section after {max_retries} attempts.")
        return None

    def _group_by_section(self, content_blocks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """
        Groups blocks into logical sections based on 'type'.
        Starts a new section whenever a Header-like type is encountered.
        """
        sections = []
        current_section = []
        
        header_types = {
            "CLAUSE", "APPENDIX", "ANNEX", "EXHIBIT", "GUIDELINE", "INFO",
            "CLAUSE_START", "APPENDIX_START", "ANNEX_START", "EXHIBIT_START", "GUIDELINE_START", "INFO_START"
        }
        
        for block in content_blocks:
            b_type = block.get("type", "CONTENT").upper()
            
            if b_type in header_types:
                if current_section:
                    sections.append(current_section)
                current_section = [block]
            else:
                current_section.append(block)
                
        if current_section:
            sections.append(current_section)
            
        return sections
