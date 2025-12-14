import os
import sys
import numpy as np
import sherpa_onnx
import librosa
import difflib

# Add backend directory to path to import config if needed (though we'll hardcode paths for simplicity/reliability)
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(BACKEND_DIR)

# Paths
MODEL_DIR = os.path.join(BACKEND_DIR, "models_storage", "zipformer", "hynt-zipformer-30M-6000h")
AUDIO_FILE = r"D:\stt-hds-demo\example-test\example-1\mp3\Hà Nội_ Người bị thu hồi đất được mua nhà ở xã hội không cần qua bốc thăm _ Cụm tin _ VTV24.mp3"
SUBTITLE_FILE = r"D:\stt-hds-demo\example-test\example-1\subtitle-youtube\subtitle-form-yt.txt"

def format_vietnamese_text(text: str) -> str:
    """Convert text to Sentence case."""
    if not text:
        return ""
    text = text.lower()
    if text:
        text = text[0].upper() + text[1:]
    return text

def main():
    print("=" * 60)
    print("  STT Accuracy Test (Offline Inference)")
    print("=" * 60)

    # 1. Load Model
    print(f"\n[1] Loading Model from: {MODEL_DIR}")
    tokens = os.path.join(MODEL_DIR, "tokens.txt")
    encoder = os.path.join(MODEL_DIR, "encoder-epoch-20-avg-10.int8.onnx")
    decoder = os.path.join(MODEL_DIR, "decoder-epoch-20-avg-10.int8.onnx")
    joiner = os.path.join(MODEL_DIR, "joiner-epoch-20-avg-10.int8.onnx")

    if not os.path.exists(encoder):
        print(f"Error: Model file not found: {encoder}")
        return

    try:
        recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            tokens=tokens,
            encoder=encoder,
            decoder=decoder,
            joiner=joiner,
            num_threads=2,
            sample_rate=16000,
            feature_dim=80,
            decoding_method="greedy_search",
            provider="cpu",
        )
        print("    ✅ Model loaded successfully")
    except Exception as e:
        print(f"    ❌ Failed to load model: {e}")
        return

    # 2. Load Audio
    print(f"\n[2] Loading Audio: {os.path.basename(AUDIO_FILE)}")
    try:
        # Load and resample to 16kHz
        audio, sample_rate = librosa.load(AUDIO_FILE, sr=16000)
        print(f"    ✅ Audio loaded: {len(audio)/16000:.2f} seconds")
    except Exception as e:
        print(f"    ❌ Failed to load audio: {e}")
        return

    # 3. Transcribe
    print("\n[3] Transcribing...")
    try:
        stream = recognizer.create_stream()
        stream.accept_waveform(16000, audio)
        recognizer.decode_stream(stream)
        
        result_text = stream.result.text
        formatted_result = format_vietnamese_text(result_text)
        
        print("\n" + "-" * 40)
        print("TRANSCRIPTION RESULT:")
        print("-" * 40)
        print(formatted_result)
        print("-" * 40)

    except Exception as e:
        print(f"    ❌ Transcription failed: {e}")
        return

    # 4. Compare with Ground Truth
    print("\n[4] Comparing with Ground Truth...")
    try:
        with open(SUBTITLE_FILE, 'r', encoding='utf-8') as f:
            ground_truth = f.read().replace('\n', ' ').strip()
        
        # Simple normalization for comparison
        gt_norm = ground_truth.lower()
        pred_norm = formatted_result.lower()
        
        # Calculate similarity (SequenceMatcher)
        similarity = difflib.SequenceMatcher(None, gt_norm, pred_norm).ratio()
        
        print(f"    Similarity Score: {similarity*100:.2f}%")
        
        if similarity < 0.8:
             print("\n    ⚠️  Low accuracy detected!")
             print("    Ground Truth sample: ", gt_norm[:100], "...")
             print("    Prediction sample:   ", pred_norm[:100], "...")
        else:
             print("    ✅ Accuracy looks good!")
             
    except Exception as e:
         print(f"    ⚠️  Could not load/compare subtitle: {e}")

if __name__ == "__main__":
    main()
