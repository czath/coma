"""
Pydantic models for V7 reference extraction pipeline.
Each stage has strict input/output validation.
"""

from pydantic import BaseModel, Field, validator, model_validator
from typing import List, Optional
from enum import Enum

# ============================================================================
# STAGE 1: SCANNER SCHEMAS
# ============================================================================

class ScannedReference(BaseModel):
    """
    Output from Scanner stage.
    Contains only source information - no target resolution.
    """
    source_id: str = Field(
        ...,
        description="Section ID where reference was found",
        example="c_3"
    )
    source_header: str = Field(
        ...,
        description="Section header/title",
        example="3. Payment Terms"
    )
    source_verbatim: str = Field(
        ...,
        description="Exact text snippet containing the reference",
        example="Supplier shall invoice Customer per the payment schedule in clause 4.1"
    )
    
    @validator('source_verbatim')
    def clean_verbatim(cls, v):
        """Remove extra whitespace, validate not empty"""
        cleaned = ' '.join(v.split())
        if not cleaned:
            raise ValueError('source_verbatim cannot be empty after cleaning')
        return cleaned
    
    @validator('source_id', 'source_header')
    def no_empty_strings(cls, v):
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()

# ============================================================================
# STAGE 2: MAPPER SCHEMAS
# ============================================================================

class MappedReference(BaseModel):
    """
    Output from Mapper stage.
    Includes target resolution and validation status.
    """
    source_id: str
    source_header: str
    source_verbatim: str
    target_id: Optional[str] = Field(
        None,
        description="Resolved section ID or null if invalid"
    )
    is_valid: bool
    justification: str = Field(
        ...,
        min_length=5,
        max_length=200
    )
    mapper_verdict: str = Field(
        "REJECT",
        description="Explicit verdict: ACCEPT or REJECT"
    )
    
    @model_validator(mode='after')
    def validate_target_consistency(self):
        """Ensure target_id and is_valid are consistent"""
        if self.is_valid and not self.target_id:
            raise ValueError('is_valid=True requires target_id to be set')
        if not self.is_valid and self.target_id:
            raise ValueError('is_valid=False should have target_id=null')
        
        return self

# ============================================================================
# STAGE 3: JUDGE SCHEMAS
# ============================================================================

class JudgeVerdict(BaseModel):
    """
    Output from Judge stage.
    Final validation decision for a single reference.
    Judge independently validates and can modify previous flags.
    """
    is_valid: bool
    is_self_reference: bool = False
    reason: str = Field(
        ...,
        min_length=5,
        max_length=150,
        description="Concise explanation of verdict"
    )

