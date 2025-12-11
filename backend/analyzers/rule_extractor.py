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


# Import Pydantic models
from data_models import AnalysisResponse, Rule, Term
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
        
        # Load System Prompt
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "analysis_prompt.txt")
        with open(prompt_path, "r") as f:
            self.base_prompt = f.read()

        # Load Consolidation Prompt
        consolidation_prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "consolidation_prompt.txt")
        with open(consolidation_prompt_path, "r") as f:
            self.consolidation_prompt = f.read()

        # Load Rule Dedup Prompt
        rule_dedup_prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "rule_dedup_prompt.txt")
        with open(rule_dedup_prompt_path, "r") as f:
            self.rule_dedup_prompt = f.read()

        # Global Rate Limiter (Tier 1 = 30 concurrent requests)
        self.sem = asyncio.Semaphore(30)

    async def extract(self, content_blocks: List[Dict[str, Any]], progress_callback=None, stats=None) -> Dict[str, Any]:
        """
        Main extraction method using Section-Based Analysis concurrently.
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
        
        msg = f"Starting Extraction Analysis using LLM Model: {self.model_name}"
        logger.info(msg)
        print(f"\n[{self.model_name.upper()}] {msg}")
        print(f"[{self.model_name.upper()}] Temp: {self.config.get('temperature')} | Thinking: {bool(self.config.get('thinking_config'))}")

        all_rules = []
        all_taxonomy = []
        
        # NOTE: Local semaphore removed. Using global self.sem inside methods.
        
        async def process_section(section):
            section_text = "\n".join([b.get("text", "") for b in section])
            # Skip empty sections
            if not section_text.strip():
                return None
            
            # Identify known header from the first block of the section
            header_text = "Unknown Section"
            known_header_types = {
                "CLAUSE", "APPENDIX", "ANNEX", "EXHIBIT", "GUIDELINE", "INFO",
                "CLAUSE_START", "APPENDIX_START", "ANNEX_START", "EXHIBIT_START", "GUIDELINE_START", "INFO_START"
            }

            if section:
                first_block = section[0]
                first_type = first_block.get("type", "").upper()
                if first_type in known_header_types:
                    header_text = first_block.get("text", "Unknown Section")
                
                print(f"DEBUG: Section First Block Type: {first_type}, Identified Header: {header_text}")
            
            logger.info(f"Processing Section with Header: {header_text}")

            # CHUNKING LOGIC FOR LARGE SECTIONS
            MAX_SECTION_CHARS = self.processing_config.get("MAX_SECTION_CHARS", 100000) 
            merged_response = AnalysisResponse(taxonomy=[], rules=[]) # Accumulator

            # Get Source ID (First Block ID)
            source_id = None
            if section:
                    source_id = section[0].get("id")

            if len(section_text) > MAX_SECTION_CHARS:
                logger.info(f"Section size {len(section_text)} exceeds limit. Splitting into chunks.")
                chunks = []
                start = 0
                while start < len(section_text):
                    # Ensure we don't exceed remaining text
                    end = min(start + MAX_SECTION_CHARS, len(section_text))
                    
                    # Only look for newline if we are NOT at end of text (i.e. we are splitting via limit)
                    if end < len(section_text):
                        # Look for newline in the valid chunk range [start, end]
                        # But prefer newlines closer to the 'end' than 'start' to maximize chunk size
                        # Ensure we don't accidentally set end=start if newline is at start
                        last_newline = section_text.rfind('\n', start, end)
                        
                        # Valid newline logic: must be found AND must be past the midpoint (or reasonable minimum) 
                        # to avoid infinite loops or tiny chunks.
                        # Using start + 1000 ensures we advance at least 1000 chars if possible
                        if last_newline != -1 and last_newline > (start + 1000):
                            end = last_newline

                    chunk = section_text[start:end]
                    if not chunk: # Safety for infinite loop
                        break
                        
                    chunks.append(chunk)
                    start = end
                
                # Process chunks IN PARALLEL
                logger.info(f"Processing {len(chunks)} chunks concurrently...")
                chunk_tasks = [self._analyze_section_with_retry(chunk) for chunk in chunks]
                results = await asyncio.gather(*chunk_tasks)
                
                for i, res in enumerate(results):
                    if res:
                        for r in res.rules:
                            r.id = str(uuid.uuid4()) # CRITICAL FIX: Prevent ID collisions from parallel ISO execution
                            r.source_header = header_text
                            r.source_id = source_id # Assign Source ID
                        merged_response.taxonomy.extend(res.taxonomy)
                        merged_response.rules.extend(res.rules)
                
                return merged_response
            else:
                res = await self._analyze_section_with_retry(section_text)
                if res:
                    for r in res.rules:
                        r.id = str(uuid.uuid4()) # CRITICAL FIX
                        r.source_header = header_text
                        r.source_id = source_id # Assign Source ID
                return res

        # Create tasks
        tasks = [process_section(section) for section in sections]
        
        # Run tasks and update progress
        completed_results = []
        completed_count = 0
        for future in asyncio.as_completed(tasks):
            result = await future
            completed_count += 1
            if progress_callback:
                progress_callback(completed_count, total_sections, "Extracting")
            
            if result:
                completed_results.append(result)

        # Sort results by Source ID to ensure deterministic order of rules
        # Assuming source_id is comparable (string or int). If None, put at end.
        completed_results.sort(key=lambda x: (x.rules[0].source_id if x.rules and x.rules[0].source_id else "", x.rules[0].source_header if x.rules and x.rules[0].source_header else ""))

        for res in completed_results:
            all_rules.extend(res.rules)
            all_taxonomy.extend(res.taxonomy)


        
        # Update Stats
        stats["extract"]["rules"] = len(all_rules)
        stats["extract"]["terms"] = len(all_taxonomy)

        # 2. Consolidate Taxonomy
        if progress_callback:
            progress_callback(20, 100, "Grouping")
        
        final_taxonomy, tag_remap = await self._consolidate_taxonomy(all_taxonomy, progress_callback, stats=stats)
        
        # 2.5 Remap Rule Tags
        # Since terms were merged, we must point rules to the new canonical tags
        if tag_remap:
            for rule in all_rules:
                if not rule.related_tags:
                    continue
                new_tags = []
                for t in rule.related_tags:
                    # Map to new tag if exists, else keep original
                    new_tags.append(tag_remap.get(t, t))
                rule.related_tags = list(set(new_tags)) # Dedup tags
        
        # 3. Deduplicate Rules
        if progress_callback:
             progress_callback(75, 100, "Merging")
             
        final_rules = await self._deduplicate_rules(all_rules, progress_callback, stats=stats)

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
            "rules": [r.model_dump() for r in final_rules],
            "taxonomy": [t.model_dump() for t in final_taxonomy]
        }

    async def _deduplicate_rules(self, rules: List[Rule], progress_callback=None, stats=None) -> List[Rule]:
        """
        Deduplicates rules using Cluster-and-Judge architecture:
        1. Embed rules (quotes).
        2. Cluster using relaxed threshold (from config).
        3. Send clusters to LLM to identify real duplicates.
        """
        if not rules:
            return []

        # 1. Filter rules with valid quotes
        valid_rules = [r for r in rules if r.verification_quote and r.verification_quote.strip()]
        if not valid_rules:
            return rules 

        logger.info(f"Deduplicating {len(valid_rules)} rules using LLM Model: {self.model_name}")
        
        if progress_callback:
            progress_callback(10, 100, "Merging")

        # 2. Embed Quotes
        quotes = [r.verification_quote for r in valid_rules]
        embeddings = []
        BATCH_SIZE = self.processing_config.get("EMBEDDING_BATCH_SIZE", 2000)
        
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
             if not r.verification_quote or not r.verification_quote.strip():
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

    async def _resolve_rule_clusters_with_llm(self, clusters: List[List[int]], all_rules: List[Rule]) -> List[str]:
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
                     "description": rule.description or rule.logic_instruction,
                     "quote": rule.verification_quote
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

    def _fallback_string_dedupe(self, rules: List[Rule]) -> List[Rule]:
        unique_map = {}
        for r in rules:
            if not r.verification_quote:
                continue
            fingerprint = "".join(r.verification_quote.split()).lower()
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


    async def _analyze_section_with_retry(self, section_text: str, max_retries: int = 5) -> Optional[AnalysisResponse]:
        """
        Analyzes a single section using the new SDK's Structured Output capability.
        """
        backoff = 2
        
        for attempt in range(max_retries):
            try:
                # Prepare Config
                gen_config_args = {
                    "temperature": self.config.get("temperature", 0.0),
                    "top_p": self.config.get("top_p", 1.0),
                    "top_k": self.config.get("top_k", 40),
                    "response_mime_type": "application/json",
                    "response_schema": AnalysisResponse
                }

                # Add Thinking Config if present
                thinking_conf = self.config.get("thinking_config")
                if thinking_conf:
                    gen_config_args["thinking_config"] = types.ThinkingConfig(
                        include_thoughts=thinking_conf.get("include_thoughts", True),
                        thinking_budget=thinking_conf.get("thinking_budget", 4096)
                    )

                # Call the Async Client
                async with self.sem:
                    response = await self.client.aio.models.generate_content(
                        model=self.model_name, 
                        contents=[self.base_prompt, section_text],
                        config=types.GenerateContentConfig(**gen_config_args)
                    )

                if response.parsed:
                    return response.parsed
                else:
                    logger.warning(f"Empty parsed response for section length {len(section_text)}.")
                    try:
                        logger.warning(f"Finish Reason: {response.candidates[0].finish_reason}")
                        logger.warning(f"Raw Text: {response.text}")
                    except Exception:
                        logger.warning("Could not read finish_reason or text.")
                    return None

            except Exception as e:
                logger.error(f"Attempt {attempt+1} failed: {e}")
                if "429" in str(e):
                    await asyncio.sleep(backoff)
                    backoff *= 2
                else:
                    await asyncio.sleep(1)
        
        logger.error(f"Failed to analyze section after {max_retries} attempts.")
        return None

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
