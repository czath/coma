from typing import List, Dict, Any
from google import genai
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity
from hipdam.models import ExpertRecommendation, Cluster

class Clusterer:
    def __init__(self, client: genai.Client, config: Dict[str, Any]):
        self.client = client
        self.config = config
        self.model_name = config.get("model", "text-embedding-004")
        self.threshold = config.get("threshold", 0.85)

    async def cluster_recommendations(self, recommendations: List[ExpertRecommendation]) -> List[Cluster]:
        """
        Groups recommendations semantically.
        """
        if not recommendations:
            return []
        
        if len(recommendations) == 1:
            # Singleton cluster
            return [Cluster(recommendation_ids=[recommendations[0].id])]

        # Extract text to embed (Support new 'verbatim_text' and legacy 'text')
        texts = [r.content.get("verbatim_text") or r.content.get("text", "") for r in recommendations]
        valid_indices = [i for i, t in enumerate(texts) if t and len(t.strip()) > 0]
        
        if not valid_indices:
             return []

        valid_texts = [texts[i] for i in valid_indices]
        
        # Embed
        try:
            # Batch embedding
            all_embeddings = []
            batch_size = 100
            
            for i in range(0, len(valid_texts), batch_size):
                batch = valid_texts[i : i + batch_size]
                batch_result = await self.client.aio.models.embed_content(
                    model=self.model_name,
                    contents=batch
                )
                batch_embeddings = [e.values for e in batch_result.embeddings]
                all_embeddings.extend(batch_embeddings)
                
            embeddings = np.array(all_embeddings)
            
            # Distance Matrix (Cosine Distance = 1 - Cosine Similarity)
            # Validation: Ensure embeddings are normalized or use metric='cosine'
            # Agglomerative uses 'distance_threshold', so distance must be 0-1 (if metric is cosine distance)
            # cosine_distance = 1 - cosine_similarity
            
            sim_matrix = cosine_similarity(embeddings)
            dist_matrix = 1 - sim_matrix
            dist_matrix = np.clip(dist_matrix, 0, 1) # Ensure range
            
            # Clustering
            # If distance threshold is X, it means items with distance < X are merged.
            # Similarity > 0.85 means Distance < 0.15
            dist_threshold = 1 - self.threshold
            
            clustering = AgglomerativeClustering(
                n_clusters=None,
                distance_threshold=dist_threshold,
                metric='precomputed',
                linkage='average'
            )
            
            labels = clustering.fit_predict(dist_matrix)
            
            # Group by label
            clusters_map = {}
            for idx, label in enumerate(labels):
                original_idx = valid_indices[idx]
                rec_id = recommendations[original_idx].id
                if label not in clusters_map:
                    clusters_map[label] = []
                clusters_map[label].append(rec_id)
                
            # Create Cluster objects
            result = []
            for label, rec_ids in clusters_map.items():
                result.append(Cluster(recommendation_ids=rec_ids))
                
            return result

        except Exception as e:
            print(f"Clustering error: {e}")
            # Fallback: Every item is its own cluster
            return [Cluster(recommendation_ids=[r.id]) for r in recommendations]
