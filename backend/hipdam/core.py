import asyncio
from typing import Dict, Any, List
import httpx
from google import genai
from hipdam.models import ExpertRecommendation, Cluster, JudgeDecision, TraceMap
from hipdam.agents import AgentRunner
from hipdam.clustering import Clusterer
from hipdam.judge import SupremeJudge
from config_llm import get_config

class HiPDAMOrchestrator:
    def __init__(self, api_key: str):
        # Explicitly configure HTTPX client to ignore SSL verification
        # This matches the legacy RuleExtractor implementation which is known to work.
        self.client = genai.Client(
            api_key=api_key,
            http_options={
                'api_version': 'v1alpha',
                'httpx_client': httpx.Client(verify=False, timeout=300),
                'httpx_async_client': httpx.AsyncClient(verify=False, timeout=300)
            }
        )
        self.config = get_config("HIPDAM")
        self.agent_runner = AgentRunner(self.client)
        self.clusterer = Clusterer(self.client, self.config.get("CLUSTERING", {}))
        self.judge = SupremeJudge(self.client, self.config.get("JUDGE", {}))

    async def analyze_section(self, section_text: str, section_id: str = "unknown", taxonomy: Optional[List[Dict[str, Any]]] = None) -> TraceMap:
        """
        Executes the full HiPDAM pipeline: 
        Agents -> Clustering -> Judge -> TraceMap
        """
        import time
        start_time = time.time()
        
        # 1. Run Agents Parallel
        print(f"--- HiPDAM: Starting Analysis for section {section_id} (Length: {len(section_text)} chars) ---")
        agent_configs = self.config.get("AGENTS", {})
        agent_tasks = []
        
        print(f"--- HiPDAM: Launching {len(agent_configs)} Agents Parallel ---")
        for agent_key, agent_cfg in agent_configs.items():
            agent_tasks.append(
                self.agent_runner.run_agent(agent_key, agent_cfg, section_text, taxonomy=taxonomy)
            )
            
        # Flatten results
        results_lists = await asyncio.gather(*agent_tasks)
        recommendations: List[ExpertRecommendation] = []
        for lst in results_lists:
            recommendations.extend(lst)

        print(f"--- HiPDAM: Agents Complete. Found {len(recommendations)} recommendations. ---")
            
        # 2. Clustering
        print(f"--- HiPDAM: Clustering started... ---")
        clusters = await self.clusterer.cluster_recommendations(recommendations)
        print(f"--- HiPDAM: Clustering Complete. Created {len(clusters)} clusters. ---")
        
        # 3. Adjudication
        decisions: List[JudgeDecision] = []
        
        # 3. Adjudication
        decisions: List[JudgeDecision] = []
        
        print(f"--- HiPDAM: Judging {len(clusters)} clusters (Parallel Execution)... ---")
        
        # Limit concurrency to avoid hitting rate limits
        sem = asyncio.Semaphore(10)
        
        async def judge_cluster_safe(cluster, idx):
            async with sem:
                print(f"    > Judge started for Cluster {idx+1}/{len(clusters)}...")
                try:
                    return await self.judge.adjudicate(cluster, recommendations, section_text, taxonomy=taxonomy)
                except Exception as e:
                    print(f"    ! Judge failed for Cluster {idx+1}: {e}")
                    return None

        judge_tasks = [judge_cluster_safe(c, i) for i, c in enumerate(clusters)]
        decision_results = await asyncio.gather(*judge_tasks)
        
        # Filter None results
        decisions = [d for d in decision_results if d is not None]
        
        total_seconds = int(time.time() - start_time)
        from datetime import timedelta
        formatted_time = str(timedelta(seconds=total_seconds))
        print(f"--- HiPDAM: Judgment Complete. {len(decisions)} decisions ratified. Total Runtime: {formatted_time} ({total_seconds}s) ---")
                
        # 4. Construct Trace
        trace = TraceMap(
            section_id=section_id,
            decisions=decisions,
            clusters=clusters,
            recommendations=recommendations
        )
        
        return trace
