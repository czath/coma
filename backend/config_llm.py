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
        "max_output_tokens": 8192
    },
    
    # Task: Deep Analysis & Rule Extraction (Logic extraction)
    "ANALYSIS": {
        "model_name": "gemini-2.0-flash",
        "temperature": 0.0,
        "max_output_tokens": 8192,
        "top_k": 1, 
        "top_p": 0.95
        # "response_mime_type": "application/json"  <-- DISABLED: Causing Hangs
    },
    
    # Task: Clause Review / Risk Assessment (Comparison against rules)
    "REVIEW": {
        "model_name": "gemini-1.5-pro",
        "temperature": 0.1, 
        "max_output_tokens": 8192
    },
    
    # Default fallback
    "DEFAULT": {
        "model_name": "gemini-2.0-flash",
        "temperature": 0.0,
        "max_output_tokens": 8192
    }
}

def get_config(task_name: str):
    """Retrieves configuration for a specific task."""
    return LLM_CONFIG.get(task_name.upper(), LLM_CONFIG["DEFAULT"])
