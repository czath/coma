Master Architecture Document (Version 6 - HiPDAM Generic Redesign): 

## Project Overview
**Goal:** Develop "Coma", a Contract Manager with "HiPDAM" (High Precision Document Analysis Module).
**Philosophy:** "Glass House" Traceability. "Generic Core" Design (No hardcoded domain logic).

---

## The Workflow

### Phase A: Structural Ingestion
*Unchanged.*

### Phase B: HiPDAM Analysis (Dynamic Ensemble)
**Architecture:** N-Agent Ensemble -> Clustering -> Adjudication

**Step 6a: The Dynamic Panel (Recommendation Phase)**
The system reads the `AGENTS` dictionary from config. It spawns 1 task per entry.
*   **The Code is Agnostic:** It does not know if the agent is looking for "Legal Rules" or "Cooking Recipes".
*   **The Prompt is King:** The System Instruction defines the output schema (e.g. `{"text":str, "label":str}`).

*Output:* `ExpertRecommendation` containing raw JSON dictionary from LLM.

**Step 6b: Semantic Clustering (Normalization)**
*   **Action:** Vectorize the primary text field (configurable) -> Agglomerative Clustering.
*   **Result:** Clusters of semantically similar JSON objects.

**Step 6c: The Supreme Judge (Decision Phase)**
*   **Input:** Cluster + Source.
*   **Task:** Arbitrate based on Judge Prompt (Configurable).
*   **Output:** `JudgeDecision` containing finalized JSON dictionary.

### "Glass House" Traceability
The final JSON output allows full audit:
1.  `decisions`: The final sanctioned objects.
2.  `clusters`: The raw groupings.
3.  `recommendations`: The raw output from every agent.
4.  `trace_map`: Linkage.

---
## Technical Implementation
**Module:** `backend/hipdam/`
**Config:** `HiPDAM_CONFIG` in `config_llm.py`.
**Key Principle:** "Code executes flow; Config defines logic."
