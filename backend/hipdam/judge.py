import json
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from hipdam.models import ExpertRecommendation, Cluster, JudgeDecision

class SupremeJudge:
    def __init__(self, client: genai.Client, config: Dict[str, Any]):
        self.client = client
        self.config = config
        self.model_name = config.get("model", "gemini-2.5-flash-thinking")
        
        # Load System Instruction (File > String)
        if "prompt_file" in config:
            try:
                import os
                prompt_path = os.path.join(os.getcwd(), config["prompt_file"])
                with open(prompt_path, "r", encoding="utf-8") as f:
                    self.system_instr = f.read()
            except Exception as e:
                print(f"Failed to load judge prompt file: {e}")
                self.system_instr = config.get("system_instruction", "You are the Judge.")
        else:
            self.system_instr = config.get("system_instruction", "You are the Judge.")

    async def adjudicate(self, cluster: Cluster, recommendations: List[ExpertRecommendation], section_text: str) -> Optional[JudgeDecision]:
        """
        Adjudicates a single cluster of recommendations against the source text.
        """
        try:
            # Gather evidence
            evidence_map = {r.id: r for r in recommendations}
            evidence_recs = [evidence_map[rid] for rid in cluster.recommendation_ids if rid in evidence_map]
            
            if not evidence_recs:
                return None
                
            # Construct Prompt Payload
            candidates_text = ""
            for i, rec in enumerate(evidence_recs):
                candidates_text += f"Candidate {i+1} (Source: {rec.source_agent}, Conf: {rec.confidence:.2f}):\n{json.dumps(rec.content, indent=2)}\n\n"
            
            prompt = f"""
### SOURCE TEXT
{section_text}

### CLUSTER CANDIDATES (Conflicting or Supporting Views)
{candidates_text}

### JUDGEMENT TASK
Review the candidates against the source text.
1. Determine if this cluster represents a VALID finding.
2. If valid, consolidate into a single "Golden Record" JSON.
3. Provide a rationale.
4. Assess your confidence (0.0 - 1.0).

Return JSON format ONLY:
{{
  "is_valid": boolean,
  "decision_content": {{ ... }},  // The finalized object
  "rationale": "string",
  "decision_confidence": float
}}
"""
            
            generation_config = types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=self.config.get("temperature", 0.0)
            )

            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=self.system_instr,
                    response_mime_type="application/json",
                    temperature=self.config.get("temperature", 0.0)
                )
            )
            
            response_text = response.text
            # Clean potential markdown
            if response_text.startswith("```json"):
                response_text = response_text[7:-3]
            elif response_text.startswith("```"):
                response_text = response_text[3:-3]
                
            data = json.loads(response_text)
            
            decision = JudgeDecision(
                is_valid=data.get("is_valid", False),
                decision_content=data.get("decision_content", {}),
                rationale=data.get("rationale", ""),
                decision_confidence=float(data.get("decision_confidence", 0.0)),
                source_cluster_id=cluster.id,
                supporting_evidence=[r.id for r in evidence_recs]
            )
            
            return decision

        except Exception as e:
            print(f"Judge error: {e}")
            return None
