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
from typing import Optional, Dict, Any, List, Type

try:
    from pydantic import BaseModel, ValidationError
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    BaseModel = None
    ValidationError = None

logger = logging.getLogger(__name__)


def _sanitize_json(text: str) -> str:
    r"""
    Sanitize JSON text to fix common LLM-generated issues.
    
    Fixes:
    - Invalid Unicode escape sequences (\u followed by non-hex characters)
    
    Args:
        text: Raw JSON text
        
    Returns:
        Sanitized JSON text
    """
    result = []
    i = 0
    while i < len(text):
        if i < len(text) - 1 and text[i] == '\\' and text[i+1] == 'u':
            # Found \u - check if it's followed by exactly 4 hex digits
            if i + 5 < len(text):
                # Can potentially be a valid escape
                hex_chars = text[i+2:i+6]
                if len(hex_chars) == 4 and all(c in '0123456789abcdefABCDEF' for c in hex_chars):
                    # Valid Unicode escape - keep as-is
                    result.append(text[i:i+6])
                    i += 6
                    continue
            
            # Invalid or truncated Unicode escape - escape the backslash
            result.append('\\\\u')
            i += 2
        else:
            result.append(text[i])
            i += 1
    
    return ''.join(result)



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
    
    # STEP 0: Sanitize JSON to fix common LLM issues
    text = _sanitize_json(response_text.strip())
    
    # STEP 1: Try direct JSON parse
    try:
        result = json.loads(text, strict=False)
        logger.debug(f"✅ Direct JSON parse succeeded (length: {len(text)})")
        return result
    except json.JSONDecodeError as e:
        logger.debug(f"Direct parse failed: {str(e)[:100]}")
    
    # STEP 3: Extract from markdown code block
    code_block_start = text.find('```')
    if code_block_start != -1:
        # Find opening bracket/brace after ```
        # We need to find the FIRST occurrence of either [ or {
        remaining = text[code_block_start:]
        open_bracket = remaining.find('[')
        open_brace = remaining.find('{')
        
        json_start = -1
        if open_bracket != -1 and (open_brace == -1 or open_bracket < open_brace):
            json_start = code_block_start + open_bracket
        elif open_brace != -1:
            json_start = code_block_start + open_brace
            
        if json_start != -1:
            # Find closing ```
            code_block_end = text.find('```', json_start)
            if code_block_end != -1:
                json_text = text[json_start:code_block_end].strip()
                try:
                    result = json.loads(json_text, strict=False)
                    logger.debug(f"✅ Markdown block parse succeeded")
                    return result
                except json.JSONDecodeError as e:
                    logger.debug(f"Markdown block parse failed: {str(e)[:100]}")
    
    # STEP 4: Find complete JSON object or list via brace/bracket counting
    # Find first [ or {
    first_bracket = text.find('[')
    first_brace = text.find('{')
    
    start_index = -1
    start_char = ''
    
    if first_bracket != -1 and (first_brace == -1 or first_bracket < first_brace):
        start_index = first_bracket
        start_char = '['
        end_char = ']'
    elif first_brace != -1:
        start_index = first_brace
        start_char = '{'
        end_char = '}'
        
    if start_index != -1:
        counter = 0
        in_string = False
        escape_next = False
        
        for i in range(start_index, len(text)):
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
                if char == start_char:
                    counter += 1
                elif char == end_char:
                    counter -= 1
                    if counter == 0:
                        # Found complete JSON structure
                        potential_json = text[start_index:i + 1]
                        try:
                            result = json.loads(potential_json, strict=False)
                            logger.debug(f"✅ Structure counting succeeded (extracted {i - start_index + 1} bytes)")
                            return result
                        except json.JSONDecodeError as e:
                            logger.error(f"Structure counting found JSON but parse failed: {str(e)[:100]}")
                        break
    
    # All strategies failed
    logger.error(f"❌ All parse methods failed for response (length: {len(text)})")
    return None


def parse_llm_json_as_list(
    response_text: str,
    item_model: Type[BaseModel]
) -> List[BaseModel]:
    """
    Parse LLM JSON list with Pydantic validation for each item.
    
    Args:
        response_text: Raw LLM response text
        item_model: Pydantic model class for list items
        
    Returns:
        List of validated Pydantic model instances
        
    Raises:
        ValueError: If parsing fails or all items invalid
        ImportError: If Pydantic not available
    """
    if not PYDANTIC_AVAILABLE:
        raise ImportError("Pydantic is required for parse_llm_json_as_list")
    
    # Try standard parser first
    data = parse_llm_json(response_text)
    
    # Caveman fallback: Find [...] directly
    if data is None:
        text = response_text.strip()
        start = text.find('[')
        end = text.rfind(']')
        if start != -1 and end > start:
            try:
                data = json.loads(text[start:end+1], strict=False)
                logger.debug(f"✅ Caveman list parse succeeded")
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse list from response: {e}")
    
    # Handle dict wrapper (LLM may return {"references": [...]} instead of [...])
    if isinstance(data, dict):
        # Try common wrapper keys
        for key in ['references', 'results', 'items', 'data', 'list']:
            if key in data and isinstance(data[key], list):
                logger.debug(f"✅ Unwrapped list from dict key '{key}'")
                data = data[key]
                break
        else:
            # Check if this is a single item (has the model fields)
            # Try to validate it as a single item
            try:
                # If this looks like a single item, wrap it in a list
                item_model(**data)  # Test validation
                logger.debug(f"✅ Single object detected, wrapping in list")
                data = [data]
            except (ValidationError, TypeError):
                # If still a dict and not a valid item, raise error
                raise ValueError(
                    f"Expected JSON list, got dict. "
                    f"Available keys: {list(data.keys())}"
                )
    
    # Validate it's a list
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON list, got {type(data).__name__}")
    
    # Validate each item with Pydantic
    validated = []
    errors = []
    
    for i, item in enumerate(data):
        try:
            validated.append(item_model(**item))
        except ValidationError as e:
            error_msg = f"Item {i}: {e.errors()}"
            errors.append(error_msg)
            logger.warning(f"Validation failed for item {i}: {e}")
    
    # If all items failed, raise error
    if errors and not validated:
        raise ValueError(f"All {len(data)} items failed validation: {errors[:3]}")
    
    # Log partial failures
    if errors:
        logger.warning(f"{len(errors)} of {len(data)} items failed validation")
    
    return validated

