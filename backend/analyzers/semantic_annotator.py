import os
import logging
from typing import Dict, Any, Optional, List
import asyncio
import httpx
from google import genai
from google.genai import types
from config_llm import get_config

logger = logging.getLogger(__name__)

class SemanticAnnotator:
    def __init__(self, model_name: str = None):
        self.config = get_config("ANALYSIS")
        self.model_name = model_name or self.config.get("model_name", "gemini-2.5-flash")
        
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
        
        # New SDK Initialization with SSL Bypass & High Timeout
        self.client = genai.Client(
            api_key=self.api_key,
            http_options={
                'api_version': 'v1beta',
                'httpx_client': httpx.Client(verify=False, timeout=600.0),
                'httpx_async_client': httpx.AsyncClient(verify=False, timeout=600.0)
            }
        )
        
        # Load Prompt
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "semantic_annotation_prompt.txt")
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt = f.read()
            
        # Throttling
        self.sem = asyncio.Semaphore(5)

    async def annotate_section(self, section_text: str, section_title: str) -> str:
        """
        Sends the text to LLM to be rewritten with semantic tags (<DEF>, <RULE>, etc).
        """
        async with self.sem:
            try:
                prompt = f"{self.system_prompt}\n\n### SECTION: {section_title}\n\n{section_text}"
                
                # Use config from llm_config.json for alignment
                generation_config = types.GenerateContentConfig(
                    temperature=self.config.get("temperature", 0.0), 
                    max_output_tokens=self.config.get("max_output_tokens", 65536)
                )

                logger.info(f"Annotating section: {section_title} ({len(section_text)} chars)")
                
                # New SDK Syntax
                response = await self.client.aio.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=generation_config
                )
                
                if response.text:
                    return response.text
                else:
                    logger.warning(f"Empty response for section {section_title}")
                    return section_text # Fallback to original text

            except Exception as e:
                logger.error(f"Annotation failed for {section_title}: {e}")
                return section_text # Fallback: return original text if failed
