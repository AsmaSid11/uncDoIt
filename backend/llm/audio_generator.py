import os
import sys
from dotenv import load_dotenv
from sarvamai import SarvamAI
from sarvamai.play import save

load_dotenv(".env")

# Initialize client using environment variable or fallback
api_key = os.getenv("SARVAM_TOKEN")
client = SarvamAI(api_subscription_key="sk_il8nd0wq_mL7zek1E5cRXwtDNgD3dbWU9")

def generate_audio(transcript_text, lang = "hi-IN", output_file="output1.wav"):
    """
    Generates an instruction-like audio from the provided transcript.
    Uses 'bulbul:v3' and a slightly reduced pace for clarity.
    """
    print(f"Generating audio to {output_file}...")
    audio = client.text_to_speech.convert(
        target_language_code=lang,
        text=transcript_text,
        model="bulbul:v3",
        speaker="shubh", 
        pace=0.9
    )
    save(audio, output_file)
    print("Audio saved successfully!")

if __name__ == "__main__":
    

    transcript = "अब नीचे दिए गए 'Proceed to Checkout' बटन को दबाएं।"

    generate_audio(transcript[:2500]) # Ensuring we stay within the v3 limit of 2500 chars
