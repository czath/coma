from typing import List, Dict, Any
from data_models import Rule, Term, AnalysisResponse, RuleType, Severity
from hipdam.models import JudgeDecision, TraceMap

class LegacyAdapter:
    @staticmethod
    def to_legacy_response(trace: TraceMap) -> AnalysisResponse:
        """
        Converts HiPDAM TraceMap to legacy AnalysisResponse for frontend compatibility.
        """
        rules = []
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
                    term=text, # Assuming text is the Term, or content has 'term'
                    definition=content.get("definition", text),
                    source_id=decision.id 
                )
                taxonomy.append(term)
            else:
                # Treat as Rule/Risk
                rule_type = RuleType.OBLIGATION
                if "RISK" in label.upper() or "STRATEGY" in label.upper():
                    rule_type = RuleType.RESTRICTION
                
                # Construct Rule
                rule = Rule(
                    id=decision.id,
                    description=content.get("description", text), # Use Layman Description if available
                    type=rule_type,
                    severity=Severity.HIGH if rule_type == RuleType.RESTRICTION else Severity.MEDIUM,
                    verification_quote=text, # Use Quote for verification
                    source_id=decision.source_cluster_id
                )
                rules.append(rule)
                
        return AnalysisResponse(rules=rules, taxonomy=taxonomy)
