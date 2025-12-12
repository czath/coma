from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import uuid

class ExpertRecommendation(BaseModel):
    """
    A generic recommendation from an expert agent.
    The 'content' field is a schema-less dictionary defined by the Agent's specific prompt.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: Dict[str, Any] = Field(description="The extracted content (e.g. text, label, topic)")
    source_agent: str = Field(description="The Configuration Key of the agent (e.g. AGENT_AUDITOR)")
    confidence: float = Field(description="Self-assessed confidence (0.0 - 1.0)")
    config_snapshot: Dict[str, Any] = Field(description="Snapshot of the agent config used")

class Cluster(BaseModel):
    """
    A semantic grouping of recommendations.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    recommendation_ids: List[str] = Field(description="List of ExpertRecommendation IDs in this cluster")
    
class JudgeDecision(BaseModel):
    """
    The final adjudicated decision from the Supreme Judge.
    Links back to the source cluster and evidence.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_valid: bool = Field(description="Whether this finding is valid and should be kept")
    decision_content: Dict[str, Any] = Field(description="The finalized content (The Golden Record)")
    rationale: str = Field(description="The reasoning behind the decision")
    decision_confidence: float = Field(description="The Judge's confidence score")
    source_cluster_id: str = Field(description="ID of the cluster that triggered this decision")
    supporting_evidence: List[str] = Field(description="IDs of the ExpertRecommendations used as evidence")

class TraceMap(BaseModel):
    """
    The full audit trail for a section analysis.
    """
    section_id: str
    decisions: List[JudgeDecision]
    clusters: List[Cluster]
    recommendations: List[ExpertRecommendation]
