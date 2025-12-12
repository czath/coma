import os

# LLM Configuration Registry
# This file maps specific tasks to their corresponding LLM model settings.
# It allows independent tuning of models (e.g., using a faster model for simple tagging
# and a smarter model for complex rule extraction).

LLM_CONFIG = {
    # Task: Initial Document Tagging (Structural identification)
    "TAGGING": {
        "model_name": "gemini-2.0-flash",
        "temperature": 0.0,
        "max_output_tokens": 8192,
        "top_p": 1.0, 
        "top_k": 40
    },
    
    # Task: Deep Analysis & Rule Extraction (Logic extraction)
    "ANALYSIS": {
        "model_name": "gemini-2.0-flash", 
        "temperature": 0.0, 
        "max_output_tokens": 8192,
        "top_p": 1.0, # Disable nucleus sampling for strict determinism
        "top_k": 40,
        # "thinking_config": {
        #     "include_thoughts": False, 
        #     "thinking_budget": 4096 
        # }
    },
    "PROCESSING": {
        "API_TIMEOUT": 300, # Default timeout in seconds
        "EMBEDDING_MODEL": "text-embedding-004",
        "TERM_CLUSTERING_THRESHOLD": 0.60, # Lowered from 0.7 to catch "Warranty" vs "Warranties"
        "RULE_CLUSTERING_THRESHOLD": 0.60, # Lowered from 0.7 to catch variants
        "MAX_SECTION_CHARS": 15000,
        "EMBEDDING_BATCH_SIZE": 100
    },

    "HIPDAM": {
        "AGENTS": {
            "AGENT_AUDITOR": {
                "name": "The Auditor",
                "model": "gemini-2.5-flash",
                "temperature": 0.0,
                "top_p": 0.95,
                "system_instruction": "You are The Auditor. Extract STRICT OBLIGATIONS. Return JSON List: [{ 'text': 'EXACT SOURCE QUOTE (Full Paragraph)', 'description': 'Layman explanation of the obligation', 'label': 'OBLIGATION', 'confidence_score': 1-10 }]. CRITICAL: 'text' must be verbatim source. 'description' must be your explanation."
            },
            "AGENT_STRATEGIST": {
                "name": "The Strategist",
                "model": "gemini-2.5-flash",
                "temperature": 0.2,
                "top_p": 0.95,
                "system_instruction": "You are The Strategist. Extract NEGOTIATION RISKS. Return JSON List: [{ 'text': 'EXACT SOURCE QUOTE (Full Paragraph)', 'description': 'Layman explanation of why this is a risk', 'label': 'STRATEGY', 'confidence_score': 1-10 }]. CRITICAL: 'text' must be verbatim source. Do NOT put advice in 'text'."
            },
            "AGENT_LIBRARIAN": {
                "name": "The Librarian",
                "model": "gemini-2.5-flash",
                "temperature": 0.0,
                "top_p": 0.95,
                "system_instruction": "You are The Librarian. Extract DEFINITIONS. Return JSON List: [{ 'text': 'THE DEFINED TERM', 'definition': 'The full definition text from the document', 'label': 'DEFINITION', 'confidence_score': 1-10 }]. If distinct definition text is not present, ignore."
            },
            "AGENT_SCOUT_A": {
                "name": "Scout A",
                "model": "gemini-2.5-flash",
                "temperature": 0.7,
                "top_p": 0.95,
                "system_instruction": "You are Scout A. Extract EVERYTHING. Return JSON List: [{ 'text': 'EXACT SOURCE QUOTE (Full Paragraph)', 'description': 'Layman explanation', 'label': 'GENERAL', 'confidence_score': 1-10 }]. CRITICAL: Do NOT split dependent sentences."
            },
            "AGENT_SCOUT_B": {
                "name": "Scout B",
                "model": "gemini-2.5-flash",
                "temperature": 0.7,
                "top_p": 0.95,
                "system_instruction": "You are Scout B. Extract EVERYTHING. Return JSON List: [{ 'text': 'EXACT SOURCE QUOTE (Full Paragraph)', 'description': 'Layman explanation', 'label': 'GENERAL', 'confidence_score': 1-10 }]. CRITICAL: Do NOT split dependent sentences."
            }
        },
        "JUDGE": {
            "model": "gemini-2.5-pro",
            "temperature": 0.0,
            "system_instruction": "You are the Supreme Judge. Review clusters. Output JSON: { 'decision_content': { 'text': 'Final Quote', 'description': 'Final Layman Explanation', ... }, 'rationale': '...', 'decision_confidence': 0.0-1.0 }. RULES: 1. Ensure 'text' is a valid source quote. 2. Ensure 'description' is a clear layman summary. 3. For Definitions, ensure 'definition' field is populated."
        },
        "CLUSTERING": {
             "threshold": 0.85,
             "model": "text-embedding-004"
        }
    },
    
    # Task: Clause Review / Risk Assessment (Comparison against rules)
    "REVIEW": {
        "model_name": "gemini-1.5-pro",
        "temperature": 0.1, 
        "max_output_tokens": 8192,
        "top_p": 0.95,
        "top_k": 40
    },
    
    # Default fallback
    "DEFAULT": {
        "model_name": "gemini-2.0-flash",
        "temperature": 0.0,
        "max_output_tokens": 8192,
        "top_p": 0.95,
        "top_k": 40
    }
}

def get_config(task_name: str):
    """Retrieves configuration for a specific task."""
    return LLM_CONFIG.get(task_name.upper(), LLM_CONFIG["DEFAULT"])
