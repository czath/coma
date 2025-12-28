"""
Robust LLM JSON Response Parser

Handles common LLM output variations:
- Leading/trailing whitespace
- Markdown code blocks (```json ... ```)
- Large nested JSON structures
- Malformed responses

Usage:
    from utils.llm_parser import parse_llm_json
    
    data = parse_llm_json(llm_response.text)
    if data is None:
        # Handle parse failure
"""

import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def parse_llm_json(response_text: str) -> Optional[Dict[str, Any]]:
    """
    Parse JSON from LLM response with comprehensive fallback strategies.
    
    Args:
        response_text: Raw text response from LLM
        
    Returns:
        Parsed JSON dict, or None if parsing fails
        
    Strategies (in order):
        1. Strip whitespace → Direct JSON parse
        2. Extract from markdown code block
        3. Find JSON object via brace counting
    """
    if not response_text:
        return None
    
    # STEP 1: Strip leading/trailing whitespace
    text = response_text.strip()
    
    # STEP 2: Try direct JSON parse
    try:
        result = json.loads(text)
        logger.debug(f"✅ Direct JSON parse succeeded (length: {len(text)})")
        return result
    except json.JSONDecodeError as e:
        logger.debug(f"Direct parse failed: {str(e)[:100]}")
    
    # STEP 3: Extract from markdown code block
    code_block_start = text.find('```')
    if code_block_start != -1:
        # Find opening brace after ```
        json_start = text.find('{', code_block_start)
        if json_start != -1:
            # Find closing ```
            code_block_end = text.find('```', json_start)
            if code_block_end != -1:
                json_text = text[json_start:code_block_end].strip()
                try:
                    result = json.loads(json_text)
                    logger.debug(f"✅ Markdown block parse succeeded")
                    return result
                except json.JSONDecodeError as e:
                    logger.debug(f"Markdown block parse failed: {str(e)[:100]}")
    
    # STEP 4: Find complete JSON object via brace counting
    brace_start = text.find('{')
    if brace_start != -1:
        brace_count = 0
        in_string = False
        escape_next = False
        
        for i in range(brace_start, len(text)):
            char = text[i]
            
            if escape_next:
                escape_next = False
                continue
            
            if char == '\\':
                escape_next = True
                continue
            
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            
            if not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        # Found complete JSON object
                        potential_json = text[brace_start:i + 1]
                        try:
                            result = json.loads(potential_json)
                            logger.debug(f"✅ Brace counting succeeded (extracted {i - brace_start + 1} bytes)")
                            return result
                        except json.JSONDecodeError as e:
                            logger.error(f"Brace counting found JSON but parse failed: {str(e)[:100]}")
                        break
    
    # All strategies failed
    logger.error(f"❌ All parse methods failed for response (length: {len(text)})")
    return None
