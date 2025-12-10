import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

print("Listing available models...")
try:
    # In new SDK, client.models.list() returns an iterator of Model objects
    for m in client.models.list():
        # Filter for generation support if needed, or just list all
        # Model object has 'supported_generation_methods' usually, but structure differs slightly.
        # The default list() usually returns standard models.
        if "generateContent" in (m.supported_generation_methods or []):
            print(m.name)
except Exception as e:
    print(f"Error: {e}")
