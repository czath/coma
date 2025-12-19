import os
from google import genai
from dotenv import load_dotenv

import httpx
import warnings
from urllib3.exceptions import InsecureRequestWarning
warnings.simplefilter('ignore', InsecureRequestWarning)

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(
    api_key=api_key,
    http_options={
        'api_version': 'v1alpha',
        'httpx_client': httpx.Client(verify=False),
        'httpx_async_client': httpx.AsyncClient(verify=False)
    }
)

print("Listing available models...")
try:
    # In new SDK, client.models.list() returns an iterator of Model objects
    for m in client.models.list():
        print(m.name)
except Exception as e:
    print(f"Error: {e}")
