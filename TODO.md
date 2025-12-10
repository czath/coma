# Project To-Do List

## Critical Issues (Analysis Incomplete)
1. **Rule Extraction Variance**: 
   - Observed 30% variance in rule counts between runs.
   - Investigate temperature settings (currently 0.0) or inherent model instability.
   - Consider multiple passes or "Union" approach.

2. **Performance**:
   - Evaluation is "much too long".
   - Sections (100k chars) might be too large for fast inference. 
   - Consider optimized chunking or async pipeline improvements.

## Planned Features
- [ ] Add loading indicators for specific analysis stages.
- [ ] Implement "Stop Analysis" button.
