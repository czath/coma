import asyncio
import os
import math
from dotenv import load_dotenv
from google import genai
import httpx

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(
    api_key=api_key,
    http_options={
        'api_version': 'v1beta',
        'httpx_client': httpx.Client(verify=False),
        'httpx_async_client': httpx.AsyncClient(verify=False)
    }
)

def cosine_similarity(v1, v2):
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = sum(a * a for a in v1) ** 0.5
    norm_b = sum(b * b for b in v2) ** 0.5
    return dot_product / (norm_a * norm_b) if norm_a and norm_b else 0.0

async def check_similarity(t1, t2):
    print(f"Checking: '{t1}' vs '{t2}'")
    resp = await client.aio.models.embed_content(
        model='text-embedding-004',
        contents=[t1, t2]
    )
    v1 = resp.embeddings[0].values
    v2 = resp.embeddings[1].values
    sim = cosine_similarity(v1, v2)
    print(f"Similarity: {sim:.4f}")

async def main():
    pairs = [
        ("Contract Term", "Contract Terms"),
        ("IPR", "Intellectual Property Rights"),
        ("Pre-existing IPR", "Pre-existing intellectual property rights"),
        ("Background IPR", "Foreground IPR"), # Should be distinct
        ("Feedback", "Feedback and Residuals")
    ]
    
    for t1, t2 in pairs:
        await check_similarity(t1, t2)

if __name__ == "__main__":
    asyncio.run(main())
