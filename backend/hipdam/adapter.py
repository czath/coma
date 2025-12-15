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
            text = content.get("text", "")
            label = content.get("label", "GENERAL")
            
            # Map based on label
            if "DEFINITION" in label.upper():
                term = Term(
                    tag_id=decision.id, # Use decision ID as unique tag ID
                    term=text, # Assuming text is the Term
                    definition=content.get("definition", text),
                    source_id=decision.id 
                )
                taxonomy.append(term)
            else:
                # Treat as Guideline
                # Default Analysis
                analysis = AnalysisDetail(
                    justification="Adapted from HiPDAM decision",
                    source_insight="N/A",
                    expert_insight=decision.rationale or "N/A",
                    implication_company="N/A",
                    implication_supplier="N/A"
                )
                # Default Context
                context = ContextDetail()
                
                # Construct ExtractedGuideline
                guideline = ExtractedGuideline(
                    id=decision.id,
                    type=GuidelineType.GUIDELINE,
                    classification=NegotiationPriority.MEDIUM, # Default priority
                    verbatim_text=text,
                    rule_plain_english=content.get("description", text),
                    analysis=analysis,
                    context=context,
                    tags=[],
                    confidence=decision.decision_confidence,
                    source_reference="HiPDAM Adapter"
                )
                guidelines.append(guideline)
                
        return AnalysisResponse(rules=guidelines, taxonomy=taxonomy)
