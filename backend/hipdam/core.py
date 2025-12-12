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

    async def analyze_section(self, section_text: str, section_id: str = "unknown") -> TraceMap:
        """
        Executes the full HiPDAM pipeline: 
        Agents -> Clustering -> Judge -> TraceMap
        """
        # 1. Run Agents Parallel
        print(f"--- HiPDAM: Starting Analysis for section {section_id} ---")
        agent_configs = self.config.get("AGENTS", {})
        agent_tasks = []
        
        print(f"--- HiPDAM: Launching {len(agent_configs)} Agents Parallel ---")
        for agent_key, agent_cfg in agent_configs.items():
            agent_tasks.append(
                self.agent_runner.run_agent(agent_key, agent_cfg, section_text)
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
        
        print(f"--- HiPDAM: Judging {len(clusters)} clusters (Serial Execution)... ---")
        for i, cluster in enumerate(clusters):
            print(f"    > Judging Cluster {i+1}/{len(clusters)} ({len(cluster.recommendation_ids)} items)...")
            decision = await self.judge.adjudicate(cluster, recommendations, section_text)
            if decision:
                decisions.append(decision)
        print(f"--- HiPDAM: Judgment Complete. {len(decisions)} decisions ratified. ---")
                
        # 4. Construct Trace
        trace = TraceMap(
            section_id=section_id,
            decisions=decisions,
            clusters=clusters,
            recommendations=recommendations
        )
        
        return trace
