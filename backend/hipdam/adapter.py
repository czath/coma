from typing import List, Dict, Any
from data_models import ExtractedGuideline, Term, AnalysisResponse, GuidelineType, NegotiationPriority, AnalysisDetail, ContextDetail
from hipdam.models import JudgeDecision, TraceMap

class LegacyAdapter:
    @staticmethod
    def to_legacy_response(trace: TraceMap) -> AnalysisResponse:
        """
        Converts HiPDAM TraceMap to AnalysisResponse for frontend compatibility.
        """
        guidelines = []
        taxonomy = []
        
        for decision in trace.decisions:
            if not decision.is_valid:
                continue
                
            content = decision.decision_content
            
            # 1. Normalize Keys (Support New & Old Schema)
            text = content.get("verbatim_text") or content.get("text", "")
            plain_text = content.get("plain_text") or content.get("description", text)
            item_type = content.get("type") or content.get("label", "GENERAL")
            
            # 2. Extract Rich Analysis (if present)
            # The new schema has these in 'analysis' dict, or top level in some variations
            analysis_data = content.get("analysis", {})
            
            analysis = AnalysisDetail(
                justification=analysis_data.get("justification") or content.get("justification") or "Adapted from HiPDAM decision",
                source_insight=analysis_data.get("source_insight") or content.get("source_insight") or "N/A",
                expert_insight=content.get("expert_insight") or decision.rationale or "N/A",
                implication_company=analysis_data.get("implication_company") or content.get("implication_company") or "N/A",
                implication_supplier=analysis_data.get("implication_supplier") or content.get("implication_supplier") or "N/A"
            )

            # 3. Extract Rich Context (if present)
            context_data = content.get("context", {})
            subtype = content.get("subtype") # For OTHER type
            
            # Map subtype to instructions/examples if relevant
            # Ensure strict string types for Pydantic (handle lists from LLM)
            def ensure_str(val):
                if isinstance(val, list):
                    return "; ".join([str(v) for v in val])
                return str(val) if val else "None"

            instructions = context_data.get("instructions") or (subtype if subtype in ["INSTRUCTION", "TACTIC"] else "None")
            examples = context_data.get("examples") or (subtype if subtype == "EXAMPLE" else "None")
            
            context = ContextDetail(
                conditions=ensure_str(context_data.get("conditions") or content.get("conditions")),
                instructions=ensure_str(instructions),
                examples=ensure_str(examples)
            )

            # 4. Map based on Type
            if item_type == "DEFINITION":
                term = Term(
                    tag_id=decision.id, 
                    term=text, 
                    definition=plain_text,
                    source_id=decision.id 
                )
                taxonomy.append(term)
            else:
                # Treat as Guideline or Other
                # Map Classification to Priority
                cls_str = content.get("classification", "MEDIUM").upper()
                priority = NegotiationPriority.MEDIUM
                if cls_str == "CRITICAL": priority = NegotiationPriority.CRITICAL
                elif cls_str == "HIGH": priority = NegotiationPriority.HIGH
                elif cls_str == "LOW": priority = NegotiationPriority.LOW
                
                # Construct ExtractedGuideline
                guideline = ExtractedGuideline(
                    id=decision.id,
                    type=GuidelineType.GUIDELINE if item_type == "GUIDELINE" else GuidelineType.OTHER,
                    classification=priority,
                    verbatim_text=text,
                    rule_plain_english=plain_text,
                    analysis=analysis,
                    context=context,
                    tags=[content.get("subtype")] if subtype else [],
                    confidence=decision.decision_confidence,
                    source_reference="HiPDAM Analysis"
                )
                guidelines.append(guideline)
                
        return AnalysisResponse(rules=guidelines, taxonomy=taxonomy)
