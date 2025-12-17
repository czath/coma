import os
import asyncio
import logging
import httpx
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv
import math
import json
import uuid
from datetime import datetime


# Import Pydantic models
from data_models import (
    AnalysisResponse, 
    ExtractedGuideline, 
    GuidelineType,
    TagType, 
    RuleTaggingResponse, 
    Term, 
    ConsolidationResponse, 
    DocType
)
from config_llm import get_config

load_dotenv()
logger = logging.getLogger(__name__)

# DEBUG LOGGING SETUP
debug_logger = logging.getLogger("consolidation_debug")
debug_logger.setLevel(logging.DEBUG)
handler = logging.FileHandler("consolidation_debug.log", mode='a')
handler.setFormatter(logging.Formatter('%(message)s'))
debug_logger.addHandler(handler)
debug_logger.propagate = False # Don't spam main logs

class RuleExtractor:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")

        self.processing_config = get_config("PROCESSING")
        timeout_val = self.processing_config.get("API_TIMEOUT", 300)

        self.client = genai.Client(
            api_key=self.api_key,
            http_options={
                'api_version': 'v1beta',
                'httpx_client': httpx.Client(verify=False, timeout=timeout_val),
                'httpx_async_client': httpx.AsyncClient(verify=False, timeout=timeout_val)
            }
        )
        
        # Load Config

        self.config = get_config("ANALYSIS")
        # self.processing_config already loaded above
        self.model_name = self.config["model_name"]
        
        # Load System Prompts
        
        # Phase 1: Specialized Prompts
        logger.info("Loading Specialized Extraction Prompts...")
        prompt_dir = os.path.join(os.path.dirname(__file__), "..", "prompts")
        
        with open(os.path.join(prompt_dir, "extraction_prompt_definitions.txt"), "r", encoding="utf-8") as f:
            self.extraction_prompt_definitions = f.read()
            
        with open(os.path.join(prompt_dir, "extraction_prompt_guidelines.txt"), "r", encoding="utf-8") as f:
            self.extraction_prompt_guidelines = f.read()

        # Phase 2: Tagging
        tagging_prompt_path = os.path.join(prompt_dir, "tagging_prompt.txt")
        with open(tagging_prompt_path, "r", encoding="utf-8") as f:
            self.tagging_prompt = f.read()
            
        # Phase 3: Consolidation
        consolidation_prompt_path = os.path.join(prompt_dir, "consolidation_prompt.txt")
        with open(consolidation_prompt_path, "r", encoding="utf-8") as f:
            self.consolidation_prompt = f.read()
            
        # Phase 4: Deduplication
        rule_dedup_prompt_path = os.path.join(prompt_dir, "rule_dedup_prompt.txt")
        with open(rule_dedup_prompt_path, "r", encoding="utf-8") as f:
            self.rule_dedup_prompt = f.read()

        # Global Rate Limiter (Tier 1 = 30 concurrent requests)
        self.sem = asyncio.Semaphore(2)

    async def extract(self, content_blocks: List[Dict[str, Any]], progress_callback=None, stats=None) -> Dict[str, Any]:
        """
        Main extraction method using Sequential Multi-Pass Analysis.
        """
        # Stats Container
        if stats is None:
            stats = {
                "extract": {"terms": 0, "rules": 0},
                "vectorize": {"term_clusters": 0, "rule_clusters": 0},
                "review": {"term_groups_sent": 0, "term_merges": 0, "rule_groups_sent": 0, "rule_merges": 0}
            }

        # 1. Group content by "logical sections"
        sections = self._group_by_section(content_blocks)
        total_sections = len(sections)
        
        msg = f"Starting Multi-Pass Extraction using LLM Model: {self.model_name}"
        logger.info(msg)
        print(f"\n[{self.model_name.upper()}] {msg}")
        print(f"[{self.model_name.upper()}] Temp: {self.config.get('temperature')} | Thinking: {bool(self.config.get('thinking_config'))}")

        all_rules = []
        all_taxonomy = []
        
        async def process_section(section):
            section_text = "\n".join([b.get("text", "") for b in section])
            if not section_text.strip():
                return None
            
            # Identify Header
            header_text = "Unknown Section"
            if section:
                first_block = section[0]
                # Simple logic: use first block text as header if short enough
                text = first_block.get("text", "")
                if len(text) < 200:
                    header_text = text
            
            print(f"DEBUG: Processing Section '{header_text}' (Length: {len(section_text)} chars)")

            merged_response = AnalysisResponse(taxonomy=[], rules=[]) # Accumulator

            # --- PASS 1: DEFINITIONS ---
            print(f"  > Pass 1 (Definitions): '{header_text}'...")
            defs_res = await self._extract_rules_from_text(
                text_chunk=section_text, 
                section_title=header_text, 
                prompt_template=self.extraction_prompt_definitions,
                pass_name="DEFINITIONS"
            )
            
            if defs_res:
                for r in defs_res.rules:
                    r.id = str(uuid.uuid4())
                    r.source_reference = header_text
                merged_response.rules.extend(defs_res.rules)

            # --- PASS 2: GUIDELINES & OTHER ---
            print(f"  > Pass 2 (Guidelines): '{header_text}'...")
            guides_res = await self._extract_rules_from_text(
                text_chunk=section_text, 
                section_title=header_text, 
                prompt_template=self.extraction_prompt_guidelines,
                pass_name="GUIDELINES"
            )

            if guides_res:
                for r in guides_res.rules:
                    r.id = str(uuid.uuid4())
                    r.source_reference = header_text
                merged_response.rules.extend(guides_res.rules)

            return merged_response

        # Create tasks
        tasks = [process_section(section) for section in sections]
        
        # Run tasks and update progress
        completed_results = []
        completed_count = 0
        # Run tasks and update progress - PHASE 1: EXTRACTION
        completed_results = []
        completed_count = 0
        
        # Parallel Execution for Phase 1
        for future in asyncio.as_completed(tasks):
            result = await future
            completed_count += 1
            if progress_callback:
                progress_callback(int(completed_count / total_sections * 25), 100, "Extracting (Phase 1/5)") # 0-25%
            
            if result:
                completed_results.append(result)

        # Sort results
        completed_results.sort(key=lambda x: (x.rules[0].source_reference if x.rules and x.rules[0].source_reference else ""))

        for res in completed_results:
            all_rules.extend(res.rules)
            # res.taxonomy is empty in Phase 1
        
        # PHASE 2: TAGGING
        # if progress_callback:
        #     progress_callback(30, 100, "Tagging (Phase 2/5)")
            
        # await self._tag_rules(all_rules, progress_callback)
        
        # PHASE 3: TAXONOMY BUILD & CONSOLIDATION
        # Collect all raw tags
        # raw_tags = set()
        # for r in all_rules:
        #     if r.related_tags:
        #         for t in r.related_tags:
        #             raw_tags.add(t)

        # Create Raw Terms for Consolidation
        # all_taxonomy = [Term(tag_id=t, term=t, definition="") for t in raw_tags]
        
        # if progress_callback:
        #      progress_callback(50, 100, "Grouping (Phase 3/5)")
             
        # final_taxonomy, tag_remap = await self._consolidate_taxonomy(all_taxonomy, progress_callback, stats=stats)
        
        # PHASE 4: RECONCILIATION
        # if tag_remap:
        #     for rule in all_rules:
        #         if not rule.related_tags:
        #             continue
        #         new_tags = []
        #         for t in rule.related_tags:
        #              # Map to canonical or keep original if not remapped
        #              canonical = tag_remap.get(t, t)
        #              new_tags.append(canonical)
        #         rule.related_tags = list(set(new_tags))

        # PHASE 5: GLOBAL RULE DEDUPLICATION
        # if progress_callback:
        #      progress_callback(80, 100, "Deduplicating (Phase 4/5)")
             
        # Call the dedicated deduplication method (re-named/refactored logic)
        # final_rules = await self._deduplicate_rules(all_rules, progress_callback, stats=stats)
        
        # Log Stats
        stats["extract"]["rules"] = len(all_rules) # Raw count
        # Update consolidated counts later...

        # LOG SUMMARY

        summary_msg = (
            f"\n=== ANALYSIS PIPELINE METRICS ===\n"
            f"1. EXTRACTION:\n"
            f"   - Raw Terms Found: {stats['extract']['terms']}\n"
            f"   - Raw Rules Found: {stats['extract']['rules']}\n"
            f"2. VECTORIZATION (CLUSTERING):\n"
            f"   - Similar Term Groups: {stats['vectorize']['term_clusters']}\n"
            f"   - Similar Rule Groups: {stats['vectorize']['rule_clusters']}\n"
            f"3. LLM REVIEW:\n"
            f"   - Term Groups Sent: {stats['review']['term_groups_sent']}\n"
            f"   - Term Merges Successful: {stats['review']['term_merges']}\n"
            f"   - Rule Groups Sent: {stats['review']['rule_groups_sent']}\n"
            f"   - Rule Merges Successful: {stats['review']['rule_merges']}\n"
            f"=================================\n"
        )
        logger.info(summary_msg)
        print(summary_msg)

        return {
            "rules": [r.model_dump() for r in all_rules],
            "taxonomy": []
        }

    async def _deduplicate_rules(self, rules: List[ExtractedGuideline], progress_callback=None, stats=None) -> List[ExtractedGuideline]:
        """
        Deduplicates rules using Cluster-and-Judge architecture:
        1. Embed rules (quotes).
        2. Cluster using relaxed threshold (from config).
        3. Send clusters to LLM to identify real duplicates.
        """
        if not rules:
            return []

        # 1. Filter rules with valid quotes
        valid_rules = [r for r in rules if r.verbatim_text and r.verbatim_text.strip()]
        if not valid_rules:
            return rules 

        logger.info(f"Deduplicating {len(valid_rules)} rules using LLM Model: {self.model_name}")
        
        if progress_callback:
            progress_callback(10, 100, "Merging")

        # 2. Embed Quotes
        quotes = [r.verbatim_text for r in valid_rules]
        embeddings = []
        BATCH_SIZE = 100 # API Limit for embeddings is often 100
        
        try:
             async with self.sem:
                for i in range(0, len(quotes), BATCH_SIZE):
                    batch = quotes[i:i+BATCH_SIZE]
                    resp = await self.client.aio.models.embed_content(
                        model='text-embedding-004',
                        contents=batch
                    )
                    if resp.embeddings:
                         embeddings.extend([e.values for e in resp.embeddings])
        except Exception as e:
            logger.error(f"Rule Dedup Embed Failed: {e}")
            return self._fallback_string_dedupe(rules)

        if len(embeddings) != len(valid_rules):
            return self._fallback_string_dedupe(rules)

        # 3. Cluster Rules (Relaxed Threshold)
        # Using index to track rules: clusters will be lists of indices [0, 5, 12]
        rule_indices = list(range(len(valid_rules)))
        clusters = self._cluster_rules_semantically(rule_indices, embeddings)
        
        if stats:
             stats["vectorize"]["rule_clusters"] = len([c for c in clusters if len(c) > 1])

        if progress_callback:
            progress_callback(50, 100, "Merging")
        
        logger.info(f"Generated {len(clusters)} rule clusters for deduplication.")

        # 4. Resolve with LLM
        final_rules = []
        
        # Prepare inputs for rules that didn't have quotes (keep them)
        for r in rules:
             if not r.verbatim_text or not r.verbatim_text.strip():
                 final_rules.append(r)

        # Process clusters
        # If cluster size == 1, keep it.
        # If > 1, send to LLM.
        
        clusters_to_resolve = [c for c in clusters if len(c) > 1]
        singletons = [c[0] for c in clusters if len(c) == 1]
        
        # Add singletons directly
        for idx in singletons:
            final_rules.append(valid_rules[idx])
            
        if clusters_to_resolve:
            # Parallel Batch Processing
            BATCH_SIZE = 10 
            total_clusters = len(clusters_to_resolve)
            batches = [clusters_to_resolve[i:i + BATCH_SIZE] for i in range(0, total_clusters, BATCH_SIZE)]
            total_batches = len(batches)
            
            resolution_map = {}
            
            # Create async tasks for all batches
            batch_tasks = [self._resolve_rule_clusters_with_llm(batch, valid_rules) for batch in batches]
            
            # Wrapper to collect all kept IDs
            kept_ids_from_llm = set()
            
            completed_batches = 0
            for future in asyncio.as_completed(batch_tasks):
                batch_kept_ids = await future
                kept_ids_from_llm.update(batch_kept_ids)
                
                # Assume batch size 1 is approximation for tracking?
                # Actually we sent `batches` of clusters. 
                # We can't easily track per-cluster merge here without parsing return properly
                # But kept_ids count vs total rules in clusters gives hint.
                
                completed_batches += 1
                # Progress ranges from 75% to 95%
                if progress_callback:
                    # Map 0..total -> 75..95
                    progress_pct = 75 + int(20 * (completed_batches / total_batches))
                    progress_callback(progress_pct, 100, "Merging")
            
            if stats:
                stats["review"]["rule_groups_sent"] = len(clusters_to_resolve)
                # Count explicitly kept
                stats["review"]["rule_merges"] = len(kept_ids_from_llm) # This is KEEPS, not MERGES. User asked "successful merges".
                # Actually "Merges" usually means "reductions". 
                # Total Rules In Clusters - Kept Rules = Merged (Dropped) Rules.
                total_in_clusters = sum(len(c) for c in clusters_to_resolve)
                stats["review"]["rule_merges"] = total_in_clusters - len(kept_ids_from_llm)

            
            # Wait, singletons were PRE-ADDED. 
            # We only need to check clustered rules against the LLM verdict.
            # But the LLM only saw CLUSTERED rules.
            
            # Map Rule ID -> Rule Object
            id_to_rule = {r.id: r for r in valid_rules}
            
            for rid in kept_ids_from_llm:
                if rid in id_to_rule:
                     final_rules.append(id_to_rule[rid])

        if progress_callback:
             progress_callback(100, 100, "Merging")
        return final_rules

    def _fallback_string_dedupe(self, rules: List[ExtractedGuideline]) -> List[ExtractedGuideline]:
        """
        Fallback deduplication using exact quote matching if embeddings fail.
        """
        logger.warning("Falling back to string-based deduplication.")
        seen_quotes = set()
        unique_rules = []
        for r in rules:
            # If quote is empty, keep rule (safest)
            if not r.verbatim_text:
                unique_rules.append(r)
                continue
            
            # Normalize quote for comparison
            # Remove whitespace and lower case to catch near-duplicates
            normalized = " ".join(r.verbatim_text.lower().split())
            if normalized not in seen_quotes:
                seen_quotes.add(normalized)
                unique_rules.append(r)
        
        return unique_rules

    def _cluster_rules_semantically(self, indices: List[int], embeddings: List[List[float]]) -> List[List[int]]:
        """
        Clusters rules based on cosine similarity of their embeddings.
        Returns a list of clusters, where each cluster is a list of rule indices.
        """
        clusters = []
        # Input items with index and embedding
        # We need to act on 'indices' which point to the global 'valid_rules' list
        
        # Create a local wrapper
        items = [{'idx': i, 'emb': embeddings[i]} for i in indices]
        
        threshold = self.processing_config.get("RULE_CLUSTERING_THRESHOLD", 0.85)

        for item in items:
            matched_cluster = None
            for cluster in clusters:
                # Compare with the first item (representative) of the cluster
                rep = cluster[0]
                sim = self._cosine_similarity(item['emb'], rep['emb'])

                if sim >= threshold:
                    matched_cluster = cluster
                    break

            if matched_cluster:
                matched_cluster.append(item)
            else:
                clusters.append([item])

        return [[x['idx'] for x in c] for c in clusters]

    async def _resolve_rule_clusters_with_llm(self, clusters: List[List[int]], all_rules: List[ExtractedGuideline]) -> List[str]:
        """
        Sends extracted Rule Clusters to LLM to Identify which to KEEP.
        Returns: List of Rule IDs to KEEP.
        """
        if not clusters:
            return []

        # Prepare Payload
        cluster_payload = {}
        for idx, cluster in enumerate(clusters):
             # Format: ID -> {Quote, Category, Desc}
             group_data = []
             for rule_idx in cluster:
                 rule = all_rules[rule_idx]
                 
                 # Map 'type' to 'category' for LLM
                 # handle invalid type if any
                 rtype = rule.type.value if hasattr(rule, 'type') and hasattr(rule.type, 'value') else str(rule.type)
                 
                 group_data.append({
                     "id": rule.id,
                     "category": rtype,
                     "description": rule.rule_plain_english, # Updated field access
                     "quote": rule.verbatim_text # Updated field access
                 })
             cluster_payload[f"Cluster {idx+1}"] = group_data
             
        prompt = self.rule_dedup_prompt + f"\n\nINPUT DATA:\n{json.dumps(cluster_payload, indent=2)}"
        
        try:
             async with self.sem:
                 response = await self.client.aio.models.generate_content(
                     model=self.model_name,
                     contents=[prompt],
                     config=types.GenerateContentConfig(
                         temperature=0.0,
                         response_mime_type="application/json"
                     )
                 )
             
             if response.parsed:
                 return json.loads(response.text)
             else:
                 text = response.text
                 if "```json" in text:
                    text = text.split("```json")[1].split("```")[0]
                 return json.loads(text)
                 
        except Exception as e:
            logger.error(f"Rule Dedup LLM Failed: {e}")
            return {} # Return empty map (keeps all rules effectively if we handle it right, or maybe we need to be careful)
            
        return {}

    def _fallback_string_dedupe(self, rules: List[ExtractedGuideline]) -> List[ExtractedGuideline]:
        unique_map = {}
        for r in rules:
            if not r.verbatim_text:
                continue
            fingerprint = "".join(r.verbatim_text.split()).lower()
            key = f"{r.source_id}_{fingerprint}"
            if key not in unique_map:
                unique_map[key] = r
        return list(unique_map.values())


    async def _consolidate_taxonomy(self, raw_taxonomy: List[Term], progress_callback=None, stats=None) -> List[Term]:
        """
        Hybrid "Propose & Verify" Consolidation Pipeline.
        1. Extract (Done)
        2. Vectorize: Cluster potential synonyms (High Recall).
        3. Evaluate: LLM Judge strictly filters/merges (High Precision).
        """
        if not raw_taxonomy:
            return []

        # 1. Deduplicate by exact string first (Case Insensitive)
        unique_terms_map = {}
        for t in raw_taxonomy:
            key = t.term.strip()
            unique_terms_map[key.lower()] = t 
        
        # Sort for determinism
        unique_terms = sorted(list(unique_terms_map.values()), key=lambda x: x.term.strip().lower())
        
        if not unique_terms:
            return []

        debug_logger.info("=== START CONSOLIDATION ===")
        debug_logger.info(f"Unique Terms (Pre-Cluster): {len(unique_terms)}")

        # 2. Vectorize & Cluster
        if progress_callback:
            progress_callback(20, 100, "Grouping")
            
        # We need to pass the full Term objects or at least (Term, Def) tuples to the clusterer
        # but the clusterer works on strings. Let's keep clusterer simple (strings) 
        # but map back reliably.
        term_strings = [t.term for t in unique_terms]
        
        # CLUSTERER returns List[List[str]]
        clusters_str = await self._cluster_terms_semantically(term_strings)
        
        debug_logger.info(f"Generated {len(clusters_str)} clusters.")
        
        if stats:
            stats["vectorize"]["term_clusters"] = len([c for c in clusters_str if len(c) > 1])
        for i, c in enumerate(clusters_str):
            if len(c) > 1:
                debug_logger.info(f"Cluster {i}: {c}")

        # 3. Evaluate (LLM Judge)
        if progress_callback:
            progress_callback(60, 100, "Grouping")

        # Prepare Payload WITH DEFINITIONS
        # We need to find the definition for each string in `clusters_str`
        # Since we have `unique_terms_map` (lower key) and `unique_terms` (list),
        # we can look them up. The strings in `clusters_str` are exact copies from `term_strings`.
        
        # Create a lookup for term -> definition (using the sorted list to be safe)
        term_def_map = {t.term: t.definition for t in unique_terms}

        # Parallel Batch Processing
        BATCH_SIZE = 10
        total_clusters_count = len(clusters_str)
        cluster_batches = [clusters_str[i:i + BATCH_SIZE] for i in range(0, total_clusters_count, BATCH_SIZE)]
        total_batches_count = len(cluster_batches)
        
        resolution_map = {}
        
        # Create async tasks
        batch_tasks = [self._resolve_clusters_with_llm(batch_clusters, term_def_map) for batch_clusters in cluster_batches]
        
        completed_batches = 0
        for future in asyncio.as_completed(batch_tasks):
            batch_res = await future
            resolution_map.update(batch_res)
            
            completed_batches += 1
            # Progress ranges from 60% to 95%
            if progress_callback:
                current_pct = 60 + int(35 * (completed_batches / total_batches_count))
                progress_callback(current_pct, 100, "Grouping")
        
        debug_logger.info("Resolution Map from LLM:")
        debug_logger.info(resolution_map)
        
        if stats:
             stats["review"]["term_groups_sent"] = len([c for c in clusters_str if len(c) > 1])
             merges = 0
             for k, v in resolution_map.items():
                 if k != v:
                     merges += 1
             stats["review"]["term_merges"] = merges
        
        # 4. Rebuild Final Taxonomy
        final_terms_map = {} # Canonical Name -> Term Object
        tag_remap = {} # Old Tag ID -> New Tag ID (Winner)
        
        for term_obj in unique_terms:
            original_text = term_obj.term
            canonical_text = resolution_map.get(original_text, original_text).strip()
            
            if not canonical_text:
                canonical_text = original_text # Fallback
                
            if canonical_text not in final_terms_map:
                # Create new entry
                new_term = term_obj.model_copy()
                new_term.term = canonical_text
                # Initialize info
                new_term.definition = term_obj.definition or ""
                final_terms_map[canonical_text] = new_term
                
                # Mapping: Self -> Self
                tag_remap[term_obj.tag_id] = new_term.tag_id
            else:
                # Merge into existing
                existing = final_terms_map[canonical_text]
                
                # Mapping: This Tag -> Existing Winner Tag
                tag_remap[term_obj.tag_id] = existing.tag_id

                # Merge Definition - Smart Selection (Keep Longest/Detailed)
                new_def = term_obj.definition or ""
                if new_def:
                    if not existing.definition:
                        existing.definition = new_def
                    elif len(new_def) > len(existing.definition):
                         # If new definition is more detailed, use it.
                         existing.definition = new_def
                    # Else: keep existing (canonical winner usually has best def if sorted)
        
        # Final pass to clean definitions & Sort
        final_terms = sorted(list(final_terms_map.values()), key=lambda x: x.term.lower())
        
        logger.info(f"Consolidation complete. {len(unique_terms)} -> {len(final_terms)} terms.")
        debug_logger.info(f"=== END CONSOLIDATION: {len(final_terms)} final terms ===")
        logger.info(f"Consolidation complete. {len(unique_terms)} -> {len(final_terms)} terms.")
        debug_logger.info(f"=== END CONSOLIDATION: {len(final_terms)} final terms ===")
        if progress_callback:
            progress_callback(100, 100, "Grouping")
            
        return final_terms, tag_remap

    async def _cluster_terms_semantically(self, term_strings: List[str]) -> List[List[str]]:
        """
        Embeds terms and groups them greedily based on loose similarity (Configurable).
        Returns list of clusters (lists of strings).
        """
        if not term_strings:
            return []
            
        embeddings = []
        BATCH_SIZE = self.processing_config.get("EMBEDDING_BATCH_SIZE", 2000)
        
        try:
             async with self.sem:
                for i in range(0, len(term_strings), BATCH_SIZE):
                    batch = term_strings[i : i + BATCH_SIZE]
                    resp = await self.client.aio.models.embed_content(
                        model='text-embedding-004',
                        contents=batch
                    )
                    if resp.embeddings:
                         embeddings.extend([e.values for e in resp.embeddings])
        except Exception as e:
            logger.error(f"Taxonomy Embedding Failed: {e}")
            return [[t] for t in term_strings]

        if len(embeddings) != len(term_strings):
            logger.warning("Embedding mismatch. Fallback to no clustering.")
            return [[t] for t in term_strings]

        # Greedy Clustering
        clusters = [] 
        input_items = [{'text': t, 'emb': e} for t, e in zip(term_strings, embeddings)]
        
        threshold = self.processing_config.get("TERM_CLUSTERING_THRESHOLD", 0.75)

        for item in input_items:
            matched_cluster = None
            for cluster in clusters:
                rep = cluster[0]
                sim = self._cosine_similarity(item['emb'], rep['emb'])
                
                # Loose threshold for Recall. 0.75 is better for "Indirect" ~ "Indirect/Consequential"
                if sim >= threshold:
                    matched_cluster = cluster
                    break
            
            if matched_cluster:
                matched_cluster.append(item)
            else:
                clusters.append([item])
                
        return [[x['text'] for x in c] for c in clusters]

    async def _resolve_clusters_with_llm(self, clusters: List[List[str]], term_def_map: Dict[str, str]) -> Dict[str, str]:
        """
        Sends clusters to LLM to determine Strict Synonyms using Definitions.
        Returns: Dict {OriginalTerm -> CanonicalTerm}
        """
        multi_clusters = [c for c in clusters if len(c) > 1]
        
        # IMPORTANT: Also include singletons if they look like plurals? 
        # No, clustering should have caught them. 
        # But if "Product Warranty" and "Product Warranties" did NOT cluster, we have a bigger problem.
        # Assuming clustering worked for them (high sim), they are in multi_clusters.
        
        if not multi_clusters:
            return {}

        # Prepare Payload with definitions
        cluster_map = {}
        for idx, cluster in enumerate(multi_clusters):
            # Sort cluster items for determinism
            sorted_cluster = sorted(cluster)
            
            # Format: "Term": "Definition"
            group_data = {}
            for term in sorted_cluster:
                defn = term_def_map.get(term, "")
                group_data[term] = defn # No truncation
            
            cluster_map[f"Group {idx+1}"] = group_data
            
        import json
        payload_str = json.dumps(cluster_map, indent=2)
        
        debug_logger.info("LLM Input Payload Snippet:")
        debug_logger.info(payload_str[:500] + "...")

        try:
            async with self.sem:
                response = await self.client.aio.models.generate_content(
                    model=self.model_name,
                    contents=[self.consolidation_prompt, payload_str],
                    config=types.GenerateContentConfig(
                        temperature=self.config.get("temperature", 0.0),
                        top_p=self.config.get("top_p", 0.95),
                        top_k=self.config.get("top_k", 40),
                        response_mime_type="application/json"
                    )
                )
             
            if response.parsed:
                try:
                    return json.loads(response.text)
                except:
                   text = response.text
                   if "```json" in text:
                       text = text.split("```json")[1].split("```")[0]
                   return json.loads(text)
            else:
                 try:
                    text = response.text
                    if "```json" in text:
                       text = text.split("```json")[1].split("```")[0]
                    return json.loads(text)
                 except Exception as e:
                     logger.error(f"Failed to parse LLM JSON: {e}")
                     return {}

        except Exception as e:
            logger.error(f"LLM Resolution Failed: {e}")
            return {}

    @staticmethod
    def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
        dot_product = sum(a * b for a, b in zip(v1, v2))
        norm_a = sum(a * a for a in v1) ** 0.5
        norm_b = sum(b * b for b in v2) ** 0.5
        return dot_product / (norm_a * norm_b) if norm_a and norm_b else 0.0



    async def _extract_rules_from_text(self, text_chunk: str, section_title: str, prompt_template: str, pass_name: str) -> Optional[AnalysisResponse]:
        """
        Sends text to LLM to extract items using the provided specialized prompt.
        """
        max_retries = 3
        current_retry = 0
        
        async with self.sem:
            while current_retry < max_retries:
                # User Visibility
                print(f"DEBUG: Starting LLM Request for '{section_title}' [PASS: {pass_name}] ({len(text_chunk)} chars) [Attempt {current_retry+1}]")
                response_text = None
                response = None # Initialize response to safe-guard error handler
                try:
                    # Construct Prompt using the Template explicitly passed
                    # We just append the data to the template
                    prompt = f"{prompt_template}\n\n### DATA TO ANALYZE (Section: {section_title})\n{text_chunk}"
                    
                    # Call LLM
                    # Default to Analysis Config (gemini-2.5-flash)
                    config_args = {
                        "response_mime_type": "application/json",
                        "response_schema": AnalysisResponse,
                        "temperature": self.config.get("temperature", 0.1),
                        # Disable Top P/K for deterministic extraction if needed, but 1.0/40 is fine
                        "max_output_tokens": self.config.get("max_output_tokens", 8192),
                    }
                    
                    # Handle Thinking Config securely (Analysis Config)
                    thinking_conf = self.config.get("thinking_config") 
                    if thinking_conf and thinking_conf.get("thinking_budget"): 
                         config_args["thinking_config"] = types.ThinkingConfig(
                              include_thoughts=thinking_conf.get("include_thoughts", False),
                              thinking_budget=thinking_conf.get("thinking_budget")
                         )

                    logger.info(f"Generating with Config: {config_args}")
                    generation_config = types.GenerateContentConfig(**config_args)

                    response = await self.client.aio.models.generate_content(
                        model=self.model_name,
                        contents=prompt,
                        config=generation_config
                    )
                    
                    response_text = response.text
                    if not response_text:
                         logger.warning("Empty response from LLM for extraction.")
                         return AnalysisResponse(rules=[], taxonomy=[])

                    # Parse JSON
                    # Validate JSON structure (list of rules)
                    # The schema enforces AnalysisResponse structure
                    parsed_response = json.loads(response_text)
                    
                    # Extract Rules and ensure ID/Source
                    rules_data = parsed_response.get("rules", [])
                    extracted_rules = []
                    
                    for r_data in rules_data:
                        # Instantiate Rule object to validate
                        # Assign UUID immediately to avoid collisions
                        r_data["id"] = str(uuid.uuid4())
                        r_data["source_header"] = section_title
                        # Ensure related_tags is empty (Phase 1)
                        r_data["tags"] = []
                        
                        rule = ExtractedGuideline(**r_data) # Changed from Rule to ExtractedGuideline
                        extracted_rules.append(rule)
                        
                    return AnalysisResponse(rules=extracted_rules, taxonomy=[]) # No taxonomy in Phase 1

                except Exception as e:
                    current_retry += 1
                    logger.error(f"Extraction Error (Attempt {current_retry}/{max_retries}): {e}")
                    
                    # DEBUG: Capture the bad response
                    try:
                        timestamp = datetime.now().strftime("%H%M%S")
                        debug_path = os.path.join(os.path.dirname(__file__), "..", "..", f"debug_fail_{timestamp}_{current_retry}.txt")
                        with open(debug_path, "w", encoding="utf-8") as f:
                            f.write(f"ERROR: {str(e)}\n")
                            f.write(f"INPUT_LEN: {len(text_chunk)}\n")
                            f.write(f"RESPONSE_LEN: {len(response_text) if response_text else 0}\n")
                            
                            # Print to Console for User Visibility
                            print(f"\n[ERROR] JSON PARSE FAILED (Attempt {current_retry})")
                            print(f"Response Snippet: {response_text[:200] if response_text else 'None'}...")
                            print(f"Error: {repr(e)}\n")
                            
                            # Check Finish Reason
                            if response and response.candidates:
                                cand = response.candidates[0]
                                f.write(f"FINISH_REASON: {cand.finish_reason}\n")
                                f.write(f"SAFETY_RATINGS: {cand.safety_ratings}\n")
                            else:
                                f.write("NO CANDIDATES (or Response was None)\n")
                            
                            # Log Usage Metadata
                            if response and response.usage_metadata:
                                f.write(f"USAGE: {response.usage_metadata}\n")
                            
                            f.write("=== RAW RESPONSE ===\n")
                            f.write(response_text if response_text else "NO RESPONSE TEXT")
                        logger.info(f"Saved failed response to {debug_path}")
                    except Exception as dump_error:
                        logger.error(f"Failed to save debug dump: {dump_error}")

                    if current_retry == max_retries:
                        logger.error("Max retries reached. Returning empty.")
                        return AnalysisResponse(rules=[], taxonomy=[])
                    await asyncio.sleep(1 * current_retry)
            
            return AnalysisResponse(rules=[], taxonomy=[])

    async def _tag_rules(self, rules: List[ExtractedGuideline], progress_callback=None) -> List[ExtractedGuideline]:
        """
        Phase 2: Functional Rule Tagging.
         Assigns tags to Functional Rules (O/R/P). Skips Definitions.
        """
        # Filter for Functional Rules only
        functional_rules = [r for r in rules if r.type != GuidelineType.DEFINITION]
        definitions = [r for r in rules if r.type == GuidelineType.DEFINITION]
        
        if not functional_rules:
            logger.info("No functional rules to tag.")
            return

        batch_size = 20
        total_batches = math.ceil(len(functional_rules) / batch_size)
        
        logger.info(f"Tagging {len(functional_rules)} functional rules in {total_batches} batches.")
        
        # Determine Tagging Schema (RuleTaggingResponse)
        from data_models import RuleTaggingResponse

        async def process_batch(batch_rules, batch_idx):
            # Prepare Input Text
            rules_text = json.dumps([
                {"rule_id": r.id, "text": r.verbatim_text, "type": r.type} 
                for r in batch_rules
            ], indent=2)
            
            prompt = f"{self.tagging_prompt}\n\n### INPUT RULES (Batch {batch_idx+1}/{total_batches})\n{rules_text}"
            
            try:
                # Reuse Analysis Config (or specialized Tagging Config if exists - using Analysis for now)
                generation_config = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=RuleTaggingResponse,
                    temperature=0.0, # Deterministic tagging
                    top_p=1.0,
                    max_output_tokens=8192
                )

                async with self.sem:
                    response = await self.client.aio.models.generate_content(
                        model=self.model_name,
                        contents=prompt,
                        config=generation_config
                    )
                    
                    if not response.text:
                         return []

                    parsed = json.loads(response.text)
                    return parsed.get("tagged_rules", [])

            except Exception as e:
                logger.error(f"Tagging Batch {batch_idx+1} Error: {e}")
                return []

        tasks = []
        for i in range(0, len(functional_rules), batch_size):
            batch = functional_rules[i : i + batch_size]
            tasks.append(process_batch(batch, i // batch_size))

        results = await asyncio.gather(*tasks)
        
        # Apply Tags to Rules
        tag_map = {}
        for batch_res in results:
            for item in batch_res:
                tag_map[item["rule_id"]] = item["tags"]
        
        for rule in functional_rules:
            if rule.id in tag_map:
                # Ensure tags are uppercase/normalized if needed, but let's trust LLM + Consolidation
                rule.tags = tag_map[rule.id]
        
        # Definitions remain with empty tags (as initialized)
        logger.info("Tagging Complete.")

    def _group_by_section(self, content_blocks: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """
        Groups blocks into logical sections based on 'type'.
        Starts a new section whenever a Header-like type is encountered.
        """
        sections = []
        current_section = []
        
        header_types = {
            "CLAUSE", "APPENDIX", "ANNEX", "EXHIBIT", "GUIDELINE", "INFO",
            "CLAUSE_START", "APPENDIX_START", "ANNEX_START", "EXHIBIT_START", "GUIDELINE_START", "INFO_START"
        }
        
        for block in content_blocks:
            b_type = block.get("type", "CONTENT").upper()
            
            if b_type in header_types:
                if current_section:
                    sections.append(current_section)
                current_section = [block]
            else:
                current_section.append(block)
                
        if current_section:
            sections.append(current_section)
            
        return sections
