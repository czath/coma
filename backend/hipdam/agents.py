import json
import asyncio
from typing import List, Dict, Any
from google import genai
from google.genai import types
from hipdam.models import ExpertRecommendation

class AgentRunner:
    def __init__(self, client: genai.Client):
        self.client = client

    async def run_agent(self, agent_id: str, agent_config: Dict[str, Any], section_text: str) -> List[ExpertRecommendation]:
        """
        Runs a single expert agent against the text.
        """
        try:
            model_name = agent_config.get("model", "gemini-2.0-flash") # Fallback to 2.0 if 2.5 not avail
            system_instr = agent_config.get("system_instruction", "")
            
            # Construct Prompt
            prompt = f"""
### INPUT TEXT
{section_text}

### INSTRUCTIONS
Strictly follow your System Instruction. 
Return ONLY a valid JSON List. Do not use markdown code blocks.
"""
            
            config_args = {
                "temperature": agent_config.get("temperature", 0.0),
                "top_p": agent_config.get("top_p", 0.95),
                "response_mime_type": "application/json"
            }
            
            generation_config = types.GenerateContentConfig(**config_args)

            response = await self.client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instr,
                    **config_args
                )
            )

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
                    conf_score = item.get("confidence_score", 0)
                    if conf_score > 1: # Assuming 1-10 scale
                        conf = float(conf_score) / 10.0
                    else:
                        conf = float(conf_score)

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
