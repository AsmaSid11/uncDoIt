import traceback
import os
import sys

# Make sure .env is loaded
from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv("backend/.env")

print(f"GOOGLE_API_KEY set: {bool(os.getenv('GOOGLE_API_KEY'))}")
print(f"GOOGLE_API_KEY value (first 10): {(os.getenv('GOOGLE_API_KEY') or '')[:10]}...")

# Test the ai_engine directly
try:
    from backend.app.services.ai_engine import generate_actions
    print("\nCalling generate_actions...")
    result = generate_actions(
        user_intent="Buy this product",
        buttons=["Add to Cart", "Buy Now"],
        inputs=["Enter address"],
        links=["Go to Cart"],
        text=["Product details"],
    )
    print(f"SUCCESS: {result}")
except Exception:
    traceback.print_exc()
