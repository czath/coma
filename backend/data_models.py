from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

# --- Enums (Shared) ---

# --- Enums (Shared) ---

class GuidelineType(str, Enum):
    GUIDELINE = "GUIDELINE"       # Encapsulates Obligations and Restrictions
    DEFINITION = "DEFINITION"
    OTHER = "OTHER"             # Content that does not fit other categories

class NegotiationPriority(str, Enum):
    CRITICAL = "CRITICAL"       # Must have
    HIGH = "HIGH"               # Strongly advice/prefer
    MEDIUM = "MEDIUM"           # Prefer
    LOW = "LOW"                 # Nice to have

class TagType(str, Enum):
    # Primary "Start" tags as requested by Prompt
    INFO_START = "INFO_START"
    CLAUSE_START = "CLAUSE_START"
    APPENDIX_START = "APPENDIX_START"
    ANNEX_START = "ANNEX_START"
    EXHIBIT_START = "EXHIBIT_START"
    GUIDELINE_START = "GUIDELINE_START"
    
    # Body content
    CONTENT = "CONTENT"
    
    # Legacy/Fallback (if LLM hallucinates or for compatibility)
    INFO = "INFO"
    CLAUSE = "CLAUSE"
    APPENDIX = "APPENDIX"
    ANNEX = "ANNEX"
    EXHIBIT = "EXHIBIT"
    GUIDELINE = "GUIDELINE"
    
class DocType(str, Enum):
    MASTER = "MASTER"
    SUBORDINATE = "SUBORDINATE"
    REFERENCE = "REFERENCE"

# --- Analysis Models (RuleExtractor) ---

class AnalysisDetail(BaseModel):
    justification: str = Field(description="Why this classification was chosen.")
    source_insight: str = Field(description="Insight/Reasoning explicitly provided in the source text (if any). Default: 'None'")
    expert_insight: str = Field(description="The LLM's own expert insight/reasoning as a Contract Expert.")
    implication_company: str = Field(description="What this implies for the Company.")
    implication_supplier: str = Field(description="What this implies for the Supplier.")

class ContextDetail(BaseModel):
    conditions: str = Field(description="Conditions for application (e.g. 'US Only' or 'Contingent on X'). Default: 'None'")
    instructions: str = Field(description="Wording or negotiation instructions (e.g. 'Use wording...'). Default: 'None'")
    examples: str = Field(description="Practical examples provided. Default: 'None'")

class ExtractedGuideline(BaseModel):
    id: str = Field(description="Unique UUID (Must be unique across document)")
    type: GuidelineType = Field(description="Functional type of the content")
    classification: NegotiationPriority = Field(description="Strategic priority level")
    
    verbatim_text: str = Field(description="Exact source text/quote.")
    rule_plain_english: str = Field(description="Plain English rule from Company POV (e.g. 'Company requires supplier to...').")
    
    analysis: AnalysisDetail
    context: ContextDetail
    
    tags: List[str] = Field(description="Keywords/Tags found.", default=[])
    confidence: float = Field(description="Confidence score 0.0-1.0")
    source_reference: str = Field(description="SECTION NAME/ID")

class Term(BaseModel):
    tag_id: str = Field(description="The unique tag identifier (e.g. TAG_AFFILIATES)")
    term: str = Field(description="The defined term")
    definition: str = Field(description="Brief topic label (e.g. 'Payment Rules').")

class AnalysisResponse(BaseModel):
    taxonomy: List[Term] = Field(description="List of defined terms found in the text", default=[])
    rules: List[ExtractedGuideline] = Field(description="List of guidelines extracted from the text", default=[])

# --- Tagging Models (LLMAutoTagger) ---

class ClassificationItem(BaseModel):
    index: int = Field(description="The index of the block being classified")
    type: TagType = Field(description="The functional classification of the block")

class ClassificationResponse(BaseModel):
    items: List[ClassificationItem] = Field(description="List of classified items")

class RuleTaggingItem(BaseModel):
    rule_id: str = Field(description="The ID of the rule being tagged")
    tags: List[str] = Field(description="List of functional tags (1-2 max) for this rule")

class RuleTaggingResponse(BaseModel):
    tagged_rules: List[RuleTaggingItem] = Field(description="List of tagging results")

class ConsolidationResponse(BaseModel):
    terms: List[Term] = Field(description="List of consolidated and normalized terms")
