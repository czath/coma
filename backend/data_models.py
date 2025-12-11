from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

# --- Enums (Shared) ---

class RuleType(str, Enum):
    RESTRICTION = "RESTRICTION"
    OBLIGATION = "OBLIGATION"
    PERMISSION = "PERMISSION"
    DEFINITION = "DEFINITION"

class Severity(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

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

class Rule(BaseModel):
    id: str = Field(description="Unique identifier for the rule (e.g., 'rule_1')")
    description: str = Field(description="The rule logic expressed in plain English (layman's terms) but concisely. (Prompt calls this logic_instruction)")
    type: RuleType = Field(description="Type of the rule")
    severity: Severity = Field(description="Risk severity of the rule")

    verification_quote: str = Field(description="Exact quote from the text verifying this rule")
    source_id: Optional[str] = Field(description="The ID of the source block", default=None)
    source_header: Optional[str] = Field(description="The header of the source section", default=None)
    related_tags: List[str] = Field(description="List of related tags (e.g. TAG_AFFILIATES)", default=[])

class Term(BaseModel):
    tag_id: str = Field(description="The unique tag identifier (e.g. TAG_AFFILIATES)")
    term: str = Field(description="The defined term")
    definition: str = Field(description="Brief topic label (e.g. 'Payment Rules').")

class AnalysisResponse(BaseModel):
    taxonomy: List[Term] = Field(description="List of defined terms found in the text", default=[])
    rules: List[Rule] = Field(description="List of rules extracted from the text", default=[])

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
