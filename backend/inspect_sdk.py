from google import genai
from google.genai import types
import inspect
from pydantic import BaseModel

print("Client init signature:")
print(inspect.signature(genai.Client.__init__))

print("\nHttpOptions fields:")
try:
    # HttpOptions is a Pydantic model in the new SDK
    print(types.HttpOptions.model_fields.keys())
except Exception as e:
    print(f"Could not inspect model_fields: {e}")
    # Fallback inspection
    print(dir(types.HttpOptions))

print("\nTrying to init Client with various options...")
try:
    # Minimal
    c = genai.Client(api_key="TEST")
    print("Minimal init works")
except Exception as e:
    print(f"Minimal init failed: {e}")
