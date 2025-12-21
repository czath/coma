import json
import asyncio
from typing import List, Dict, Any
from google import genai
from google.genai import types
from hipdam.models import ExpertRecommendation

class AgentRunner:
    def __init__(self, client: genai.Client):
        self.client = client

    async def run_agent(self, agent_id: str, agent_config: Dict[str, Any], section_text: str, taxonomy: Optional[List[Dict[str, Any]]] = None, job_id: str = None) -> List[ExpertRecommendation]:
        """
        Runs a single expert agent against the text.
        """
        try:
            model_name = agent_config.get("model", "gemini-2.0-flash") # Fallback to 2.0 if 2.5 not avail
            
            # Load System Instruction (File > String)
            system_instr = ""
            if "prompt_file" in agent_config:
                try:
                    import os
                    prompt_path = os.path.join(os.getcwd(), agent_config["prompt_file"])
                    with open(prompt_path, "r", encoding="utf-8") as f:
                        system_instr = f.read()
                except Exception as e:
                    print(f"Failed to load prompt file {agent_config['prompt_file']}: {e}")
                    system_instr = agent_config.get("system_instruction", "")
            else:
                system_instr = agent_config.get("system_instruction", "")
            
            # Construct Prompt
            prompt = f"""
### INPUT TEXT
{section_text}

### INSTRUCTIONS
Strictly follow your System Instruction. 
{"### TAXONOMY TAGS\n" + json.dumps(taxonomy, indent=2) if taxonomy else ""}
Return ONLY a valid JSON List. Do not use markdown code blocks.
"""
            
            config_args = {
                "temperature": agent_config.get("temperature", 0.0),
                "top_p": agent_config.get("top_p", 0.95),
                "response_mime_type": "application/json"
            }
            
            generation_config = types.GenerateContentConfig(**config_args)

            print(f"      [AgentRunner] {agent_id}: Generating content... (Len: {len(section_text)})")
            # Enforce strict asyncio timeout to prevent indefinite hangs
            try:
                response = await asyncio.wait_for(
                    self.client.aio.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instr,
                            **config_args
                        )
                    ),
                    timeout=300 # 5 Minute hard timeout per agent
                )

                # --- BILLING INTEGRATION ---
                if job_id and response.usage_metadata:
                    from billing_manager import get_billing_manager
                    bm = get_billing_manager()
                    await bm.track_usage(job_id, model_name, response.usage_metadata)
                # ---------------------------

            except asyncio.TimeoutError:
                print(f"      [AgentRunner] {agent_id}: TIMED OUT after 300s.")
                return []
            except asyncio.TimeoutError:
                print(f"      [AgentRunner] {agent_id}: TIMED OUT after 300s.")
                return []
                
            print(f"      [AgentRunner] {agent_id}: Generation complete.")
            response_text = response.text
            # Clean potential markdown
            if response_text.startswith("```json"):
                response_text = response_text[7:-3]
            elif response_text.startswith("```"):
                response_text = response_text[3:-3]
            
            data = json.loads(response_text)
            
            recommendations = []
            if isinstance(data, list):
                for item in data:
                    # Normalize confidence to float 0-1
                    conf_val = item.get("confidence") or item.get("confidence_score", 0)
                    try:
                        conf_score_float = float(conf_val)
                    except:
                        conf_score_float = 0.0
                        
                    if conf_score_float > 1: # Assuming 1-10 or 1-100 scale
                        conf = conf_score_float / 10.0 # Heuristic normalization. If >1 it's likely 1-10.
                        if conf > 1: conf = conf / 10.0 # If still >1 (was 0-100), divide again
                    else:
                        conf = conf_score_float

                    if "verbatim_text" in item and "text" not in item:
                         item["text"] = item["verbatim_text"] # Polyfill for legacy compatibility
                    
                    rec = ExpertRecommendation(
                        content=item,
                        source_agent=agent_id,
                        confidence=conf,
                        config_snapshot=agent_config
                    )
                    recommendations.append(rec)
            
            return recommendations

        except Exception as e:
            print(f"Error executing agent {agent_id}: {e}")
            return []
