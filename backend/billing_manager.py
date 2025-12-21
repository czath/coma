import os
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from config_llm import load_config

# Singleton Instance
_billing_manager = None

class BillingManager:
    def __init__(self):
        # Determine data directory relative to this file
        self.base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "billing")
        os.makedirs(self.base_dir, exist_ok=True)
        
        # Load Pricing Config
        conf = load_config()
        self.pricing = conf.get("PRICING", {})
        
        # Async Lock for thread safety during file writes
        self.lock = asyncio.Lock()
        
        # Sync Lock for threaded contexts
        import threading
        self.sync_lock = threading.Lock()

    def _get_file_path(self, job_id: str) -> str:
        # Sanitize job_id to prevent path traversal
        clean_id = "".join([c for c in job_id if c.isalnum() or c in ('-', '_')])
        return os.path.join(self.base_dir, f"{clean_id}.json")

    def _calculate_cost(self, model_name: str, input_tokens: int, output_tokens: int) -> tuple[float, float]:
        # Normalize model name slightly (handle versions if not exact match?)
        # For now, exact match or fallback to 0
        rates = self.pricing.get(model_name)
        if not rates:
            # Try finding by prefix if exact match fails
            for key in self.pricing:
                if key in model_name:
                    rates = self.pricing[key]
                    break
        
        if not rates:
            return 0.0, 0.0

        input_rate = rates.get("input", 0.0)
        output_rate = rates.get("output", 0.0)
        
        # Rate is per 1M tokens
        input_cost = (input_tokens / 1_000_000 * input_rate)
        output_cost = (output_tokens / 1_000_000 * output_rate)
        
        return input_cost, output_cost

    def _get_empty_manifest(self, job_id: str) -> Dict[str, Any]:
        return {
            "job_id": job_id,
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "usage": {}, # model_name -> { input, output, input_cost, output_cost, total_cost }
            "total_cost_usd": 0.00
        }

    async def initialize_job(self, job_id: str, resume: bool = True):
        """
        Initializes billing for a job. 
        If resume=True and file exists, it does nothing (preserves existing data).
        If resume=False, it overwrites with empty manifest.
        """
        path = self._get_file_path(job_id)
        
        async with self.lock:
            if os.path.exists(path) and resume:
                return # Keep existing
            
            # Create new
            manifest = self._get_empty_manifest(job_id)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

    def initialize_job_sync(self, job_id: str, resume: bool = True):
        """Synchronous version of initialize_job"""
        path = self._get_file_path(job_id)
        
        with self.sync_lock:
            if os.path.exists(path) and resume:
                return
            
            manifest = self._get_empty_manifest(job_id)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

    async def track_usage(self, job_id: str, model_name: str, usage_metadata: Any):
        """
        Updates the billing file safely.
        usage_metadata can be dict or object with prompt_token_count/candidates_token_count
        """
        if not job_id:
            return

        #Normalize usage data
        if hasattr(usage_metadata, 'prompt_token_count'):
            input_tokens = usage_metadata.prompt_token_count
            output_tokens = usage_metadata.candidates_token_count or 0 # Sometimes null?
        elif isinstance(usage_metadata, dict):
            input_tokens = usage_metadata.get("prompt_token_count", 0) or usage_metadata.get("input_tokens", 0)
            output_tokens = usage_metadata.get("candidates_token_count", 0) or usage_metadata.get("output_tokens", 0)
        else:
            return # Unknown format

        input_cost, output_cost = self._calculate_cost(model_name, input_tokens, output_tokens)
        total_cost = input_cost + output_cost
        
        path = self._get_file_path(job_id)

        async with self.lock:
            # Load
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                     data = self._get_empty_manifest(job_id) # Recover from corruption
            else:
                 data = self._get_empty_manifest(job_id)

            # Update Model Stats
            if model_name not in data["usage"]:
                data["usage"][model_name] = {
                    "input": 0, "output": 0, 
                    "input_cost": 0.0, "output_cost": 0.0, 
                    "total_cost": 0.0
                }
            
            # Helper to safely get existing or default to 0 (migration support)
            curr = data["usage"][model_name]
            
            curr["input"] = curr.get("input", 0) + input_tokens
            curr["output"] = curr.get("output", 0) + output_tokens
            
            curr["input_cost"] = curr.get("input_cost", 0.0) + input_cost
            curr["output_cost"] = curr.get("output_cost", 0.0) + output_cost
            curr["total_cost"] = curr.get("total_cost", 0.0) + total_cost
            
            # Update Totals
            current_total = data.get("total_cost_usd", 0.0)
            data["total_cost_usd"] = current_total + total_cost
            data["last_updated"] = datetime.now().isoformat()

            # Atomic Write
            # Write to temp then rename to avoid read conflicts
            temp_path = path + ".tmp"
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            
            # Atomic rename (on POSIX, Windows is essentially atomic or fast enough here)
            if os.path.exists(path):
                os.remove(path)
            os.rename(temp_path, path)

    def track_usage_sync(self, job_id: str, model_name: str, usage_metadata: Any):
        """Synchronous version of track_usage"""
        if not job_id:
            return

        #Normalize usage data
        if hasattr(usage_metadata, 'prompt_token_count'):
            input_tokens = usage_metadata.prompt_token_count
            output_tokens = usage_metadata.candidates_token_count or 0
        elif isinstance(usage_metadata, dict):
            input_tokens = usage_metadata.get("prompt_token_count", 0) or usage_metadata.get("input_tokens", 0)
            output_tokens = usage_metadata.get("candidates_token_count", 0) or usage_metadata.get("output_tokens", 0)
        else:
            return

        input_cost, output_cost = self._calculate_cost(model_name, input_tokens, output_tokens)
        total_cost = input_cost + output_cost
        
        path = self._get_file_path(job_id)

        with self.sync_lock:
            # Load
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                     data = self._get_empty_manifest(job_id)
            else:
                 data = self._get_empty_manifest(job_id)

            # Update Model Stats
            if model_name not in data["usage"]:
                data["usage"][model_name] = {
                    "input": 0, "output": 0, 
                    "input_cost": 0.0, "output_cost": 0.0, 
                    "total_cost": 0.0
                }
            
            curr = data["usage"][model_name]
            curr["input"] = curr.get("input", 0) + input_tokens
            curr["output"] = curr.get("output", 0) + output_tokens
            curr["input_cost"] = curr.get("input_cost", 0.0) + input_cost
            curr["output_cost"] = curr.get("output_cost", 0.0) + output_cost
            curr["total_cost"] = curr.get("total_cost", 0.0) + total_cost
            
            # Update Totals
            current_total = data.get("total_cost_usd", 0.0)
            data["total_cost_usd"] = current_total + total_cost
            data["last_updated"] = datetime.now().isoformat()

            # Atomic Write
            temp_path = path + ".tmp"
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            
            if os.path.exists(path):
                os.remove(path)
            os.rename(temp_path, path)

    def get_bill(self, job_id: str) -> Dict[str, Any]:
        """Synchronous read for API endpoint"""
        path = self._get_file_path(job_id)
        if not os.path.exists(path):
            return None
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return None

def get_billing_manager():
    global _billing_manager
    if _billing_manager is None:
        _billing_manager = BillingManager()
    return _billing_manager
