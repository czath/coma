import os
import httpx
from google import genai
from dotenv import load_dotenv

from dotenv import load_dotenv
import pathlib

# Try loading from backend/.env
env_path = pathlib.Path(__file__).parent.parent / 'backend' / '.env'
if env_path.exists():
    print(f"Loading .env from {env_path}")
    load_dotenv(dotenv_path=env_path)
else:
    print(f"Warning: {env_path} not found. Trying default load.")
    load_dotenv()

# Apply SSL Patch
import ssl
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key found: {api_key[:5]}...")

try:
    # Use the EXACT same client init as HiPDAMOrchestrator
    client = genai.Client(
        api_key=api_key,
        http_options={
            'api_version': 'v1beta',
            'httpx_client': httpx.Client(verify=False),
        }
    )
    
    print("Attempting to list models...")
    count = 0
    for m in client.models.list():
        count += 1
        print(f"FOUND: {m.name}")
    print(f"Total models found: {count}")

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"Error: {e}")
