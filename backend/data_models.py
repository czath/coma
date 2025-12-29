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

class GeneralTaxonomyTag(BaseModel):
    tag_id: str = Field(description="Unique semantic slug for the tag (e.g., TAG_PAYMENT_TERMS)")
    display_name: str = Field(description="Human-readable name of the tag")
    description: str = Field(description="Detailed definition of the tag's purpose")

# --- Term Sheet Models ---

class EvidenceItem(BaseModel):
    verbatim: str = Field(description="Verbatim snippet from the text.")
    section_id: str = Field(description="The ID of the section containing this snippet.")

class ValidationResult(BaseModel):
    is_valid: bool = Field(description="Whether the extracted value is accurate and cited correctly")
    confidence: str = Field(description="Confidence level: high, medium, low")
    reasoning: str = Field(description="Reasoning for the validation status or extraction failure")

class TermSheetField(BaseModel):
    summary: Optional[str] = Field(description="INSTANT PUNCHLINE: Ultra-short (2-5 words) summary for UI cards (e.g., 'Net 30', 'Delaware Law').", default=None)
    value: Optional[str] = Field(description="DETAILED LAYMAN: 1-2 sentence plain English summary of the provision.", default=None)
    evidence: List[EvidenceItem] = Field(description="List of specific verbatim snippets and their source section IDs.", default=[])
    validation: ValidationResult = Field(description="REQUIRED: Validation status from the judge. Must contain is_valid, confidence, and reasoning.")

class Party(BaseModel):
    name: str = Field(description="Full legal name of the party. MUST BE VERBATIM.")
    role: str = Field(description="Role (e.g., Client, Supplier, Contractor). MUST BE VERBATIM.")
    address: Optional[str] = Field(description="Registered address or place of business. MUST BE VERBATIM.", default=None)
    evidence: List[EvidenceItem] = Field(description="List of specific verbatim snippets and their source section IDs for the party.", default=[])
    validation: ValidationResult = Field(description="REQUIRED: Validation status from the judge. Must contain is_valid, confidence, and reasoning.")

class TermSheetResponse(BaseModel):
    contract_title: TermSheetField = Field(description="Extracted field.")
    effective_date: TermSheetField = Field(description="Extracted field.")
    expiry_and_renewal_term: TermSheetField = Field(description="Extracted field.")
    parties: List[Party]
    governing_law: TermSheetField = Field(description="Extracted field.")
    dispute_resolution: TermSheetField = Field(description="Extracted field.")
    payment_terms_currency: TermSheetField = Field(description="Extracted field.")
    payment_milestones_triggers: TermSheetField = Field(description="Extracted field.")
    warranty: TermSheetField = Field(description="Extracted field.")
    liquidated_damages: TermSheetField = Field(description="Extracted field.")
    early_termination: TermSheetField = Field(description="Extracted field.")
    limitation_of_liability: TermSheetField = Field(description="Extracted field.")
    indemnification: TermSheetField = Field(description="Extracted field.")
    epidemic_failure: TermSheetField = Field(description="Extracted field.")

