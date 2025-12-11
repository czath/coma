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
        "model_name": "gemini-2.5-flash", 
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
        "MAX_SECTION_CHARS": 100000,
        "EMBEDDING_BATCH_SIZE": 100
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
