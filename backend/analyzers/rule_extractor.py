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
                    
                return await self._analyze_section_with_retry(section_text)

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
                # result is an AnalysisResponse pydantic object
                all_rules.extend(result.rules)
                all_taxonomy.extend(result.taxonomy)

        # Deduplicate Taxonomy
        unique_taxonomy = {t.term: t for t in all_taxonomy}.values()

        return {
            "taxonomy": [t.model_dump() for t in unique_taxonomy],
            "rules": [r.model_dump() for r in all_rules]
        }

    async def _analyze_section_with_retry(self, section_text: str, max_retries: int = 3) -> Optional[AnalysisResponse]:
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
                    logger.warning(f"Empty parsed response from LLM for section: {section_text[:50]}...")
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
        
        header_types = {"CLAUSE", "APPENDIX", "ANNEX", "EXHIBIT", "GUIDELINE"}
        
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
