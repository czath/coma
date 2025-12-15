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
    """Retrieves configuration for a specific task. Reloads if needed (optional)."""
    # For now, we rely on server restart for config changes, or we could reload here.
    # To fully satisfy 'no code change', let's reload on every call?
    # No, that's slow. But maybe check mtime?
    # Let's keep it simple: Load at module level.
    # If user wants hot-reload of CONFIG, they can restart. 
    # But PROMPTS are hot-reloaded by agents code.
    return LLM_CONFIG.get(task_name.upper(), LLM_CONFIG.get("DEFAULT", {}))

def get_config(task_name: str):
    """Retrieves configuration for a specific task."""
    return LLM_CONFIG.get(task_name.upper(), LLM_CONFIG["DEFAULT"])
