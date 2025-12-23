import os
import json

# LLM Configuration Registry
# Loads from external JSON file to allow hot-swapping and cleaner code separation.

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "llm_config.json")

def load_config():
    """Loads configuration from JSON file."""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"CRITICAL: Failed to load llm_config.json: {e}")
        return {}

LLM_CONFIG = load_config()

def get_config(task_name: str):
    """Retrieves configuration for a specific task."""
    return LLM_CONFIG.get(task_name.upper(), LLM_CONFIG.get("DEFAULT", {}))
