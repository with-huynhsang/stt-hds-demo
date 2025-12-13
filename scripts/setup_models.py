#!/usr/bin/env python3
"""
Setup Models Script
===================
Downloads and configures all AI models for the Vietnamese Speech-to-Text system.

Models:
    1. Zipformer (Hynt) - Vietnamese STT model (30M params, 6000h training data)
    2. ViSoBERT-HSD-Span - Vietnamese Hate Speech Span Detection (Token Classification for span extraction)

Usage:
    python scripts/setup_models.py              # Setup all models
    python scripts/setup_models.py --zipformer  # Setup Zipformer only
    python scripts/setup_models.py --visobert   # Setup ViSoBERT-HSD-Span only
    python scripts/setup_models.py --verify     # Verify existing models

Requirements:
    - Python 3.10+
    - Internet connection
    - ~500MB disk space total
      - Zipformer: ~200MB
      - ViSoBERT-HSD-Span: ~100MB (INT8 quantized)

Output:
    backend/models_storage/
    ├── zipformer/
    │   └── hynt-zipformer-30M-6000h/
    │       ├── encoder-epoch-20-avg-10.int8.onnx
    │       ├── decoder-epoch-20-avg-10.int8.onnx
    │       ├── joiner-epoch-20-avg-10.int8.onnx
    │       ├── bpe.model
    │       └── tokens.txt
    └── visobert-hsd-span/
        ├── onnx/           # Full ONNX model (backup)
        └── onnx-int8/      # Quantized INT8 model (recommended)

Author: Vietnamese STT Project
"""
import os
import sys
import glob
import shutil
import argparse
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
MODELS_DIR = BACKEND_DIR / "models_storage"

# Zipformer Model (HuggingFace)
ZIPFORMER_REPO = "hynt/Zipformer-30M-RNNT-6000h"
ZIPFORMER_BASE_URL = f"https://huggingface.co/{ZIPFORMER_REPO}/resolve/main"
ZIPFORMER_FILES = [
    "encoder-epoch-20-avg-10.int8.onnx",
    "decoder-epoch-20-avg-10.int8.onnx",
    "joiner-epoch-20-avg-10.int8.onnx",
    "bpe.model",
]
ZIPFORMER_DIR = MODELS_DIR / "zipformer" / "hynt-zipformer-30M-6000h"

# ViSoBERT-HSD-Span Model (HuggingFace - Token Classification)
VISOBERT_MODEL_NAME = "visolex/visobert-hsd-span"
VISOBERT_DIR = MODELS_DIR / "visobert-hsd-span"
VISOBERT_ONNX_DIR = VISOBERT_DIR / "onnx"
VISOBERT_INT8_DIR = VISOBERT_DIR / "onnx-int8"


# ============================================================================
# Utility Functions
# ============================================================================

def print_header(title: str):
    """Print a formatted header."""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_step(step: str):
    """Print a step indicator."""
    print(f"\n>>> {step}")


def print_success(msg: str):
    """Print success message."""
    print(f"    ✅ {msg}")


def print_error(msg: str):
    """Print error message."""
    print(f"    ❌ {msg}")


def print_info(msg: str):
    """Print info message."""
    print(f"    ℹ️  {msg}")


def print_skip(msg: str):
    """Print skip message."""
    print(f"    ⏭️  {msg}")


def get_dir_size_mb(path: Path) -> float:
    """Get directory size in MB."""
    total = 0
    for f in glob.glob(str(path / "**" / "*"), recursive=True):
        if os.path.isfile(f):
            total += os.path.getsize(f)
    return total / (1024 * 1024)


def download_file(url: str, dest_path: Path, show_progress: bool = True) -> bool:
    """
    Download a file from URL to destination path.
    
    Args:
        url: Source URL
        dest_path: Destination file path
        show_progress: Whether to show download progress
        
    Returns:
        True if successful, False otherwise
    """
    if dest_path.exists():
        print_skip(f"Already exists: {dest_path.name}")
        return True
    
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"    📥 Downloading {dest_path.name}...")
        
        request = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; ModelSetup/1.0)'}
        )
        
        with urllib.request.urlopen(request, timeout=300) as response:
            total_size = int(response.headers.get('Content-Length', 0))
            downloaded = 0
            chunk_size = 8192
            
            with open(dest_path, 'wb') as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    if show_progress and total_size > 0:
                        percent = (downloaded / total_size) * 100
                        mb_downloaded = downloaded / (1024 * 1024)
                        mb_total = total_size / (1024 * 1024)
                        print(f"\r    Progress: {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)", end='', flush=True)
            
            if show_progress and total_size > 0:
                print()  # New line after progress
        
        print_success(f"Downloaded: {dest_path.name}")
        return True
        
    except Exception as e:
        print_error(f"Failed to download {dest_path.name}: {e}")
        if dest_path.exists():
            dest_path.unlink()
        return False


# ============================================================================
# Zipformer Setup
# ============================================================================

def generate_tokens_from_bpe(bpe_path: Path, tokens_path: Path) -> bool:
    """Generate tokens.txt from bpe.model using sentencepiece."""
    if tokens_path.exists():
        print_skip(f"Already exists: {tokens_path.name}")
        return True
    
    try:
        import sentencepiece as spm
        
        print(f"    🔄 Generating tokens.txt from bpe.model...")
        sp = spm.SentencePieceProcessor()
        sp.load(str(bpe_path))
        
        with open(tokens_path, "w", encoding="utf-8") as f:
            for i in range(sp.get_piece_size()):
                piece = sp.id_to_piece(i)
                f.write(f"{piece} {i}\n")
        
        print_success(f"Generated: {tokens_path.name}")
        return True
        
    except ImportError:
        print_error("'sentencepiece' not installed. Run: pip install sentencepiece")
        return False
    except Exception as e:
        print_error(f"Failed to generate tokens: {e}")
        return False


def setup_zipformer(force: bool = False) -> bool:
    """
    Setup Zipformer (Hynt) model from HuggingFace.
    
    Returns:
        True if successful, False otherwise
    """
    print_header("Setting up Zipformer (Hynt Vietnamese STT)")
    
    print_info(f"Repository: {ZIPFORMER_REPO}")
    print_info(f"Output: {ZIPFORMER_DIR}")
    
    # Check if already setup
    encoder_file = ZIPFORMER_DIR / "encoder-epoch-20-avg-10.int8.onnx"
    tokens_file = ZIPFORMER_DIR / "tokens.txt"
    
    if encoder_file.exists() and tokens_file.exists() and not force:
        size_mb = get_dir_size_mb(ZIPFORMER_DIR)
        print_success(f"Zipformer already set up ({size_mb:.1f} MB)")
        return True
    
    ZIPFORMER_DIR.mkdir(parents=True, exist_ok=True)
    success = True
    
    # Download all model files
    print_step("Downloading model files from HuggingFace...")
    for filename in ZIPFORMER_FILES:
        url = f"{ZIPFORMER_BASE_URL}/{filename}"
        dest_path = ZIPFORMER_DIR / filename
        if not download_file(url, dest_path):
            success = False
    
    # Generate tokens.txt from bpe.model
    bpe_path = ZIPFORMER_DIR / "bpe.model"
    
    if bpe_path.exists():
        print_step("Generating tokens.txt...")
        if not generate_tokens_from_bpe(bpe_path, tokens_file):
            success = False
    
    if success:
        size_mb = get_dir_size_mb(ZIPFORMER_DIR)
        print_success(f"Zipformer setup complete! ({size_mb:.1f} MB)")
    else:
        print_error("Zipformer setup had errors.")
    
    return success


# ============================================================================
# ViSoBERT-HSD-Span Setup (Token Classification)
# ============================================================================

def download_and_convert_visobert(model_name: str, onnx_path: Path) -> Tuple[bool, Optional[object]]:
    """Download ViSoBERT-HSD-Span model from HuggingFace and convert to ONNX.
    
    Note: This is a Token Classification model (not Sequence Classification).
    """
    try:
        from optimum.onnxruntime import ORTModelForTokenClassification
        from transformers import AutoTokenizer
        
        print(f"    📥 Downloading model: {model_name}")
        print_info("This may take a few minutes on first run...")
        
        # Download tokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        
        # Export to ONNX
        print(f"    🔄 Converting to ONNX format...")
        onnx_path.mkdir(parents=True, exist_ok=True)
        
        ort_model = ORTModelForTokenClassification.from_pretrained(
            model_name,
            export=True
        )
        
        # Save ONNX model and tokenizer
        ort_model.save_pretrained(onnx_path)
        tokenizer.save_pretrained(onnx_path)
        
        print_success(f"ONNX model saved to: {onnx_path}")
        return True, (ort_model, tokenizer)
        
    except Exception as e:
        print_error(f"Failed to download/convert model: {e}")
        return False, None


def quantize_visobert(onnx_path: Path, int8_path: Path) -> bool:
    """Apply INT8 dynamic quantization to ONNX model."""
    try:
        from optimum.onnxruntime import ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig
        from transformers import AutoTokenizer
        
        print(f"    ⚡ Quantizing to INT8...")
        int8_path.mkdir(parents=True, exist_ok=True)
        
        # Load quantizer from ONNX model
        quantizer = ORTQuantizer.from_pretrained(onnx_path)
        
        # Configure dynamic quantization for AVX2
        qconfig = AutoQuantizationConfig.avx2(
            is_static=False,
            per_channel=False
        )
        
        # Apply quantization
        quantizer.quantize(
            save_dir=int8_path,
            quantization_config=qconfig
        )
        
        # Copy tokenizer to quantized model directory
        tokenizer = AutoTokenizer.from_pretrained(onnx_path)
        tokenizer.save_pretrained(int8_path)
        
        print_success(f"INT8 model saved to: {int8_path}")
        return True
        
    except Exception as e:
        print_error(f"Failed to quantize model: {e}")
        return False


def verify_visobert(model_path: Path, model_name: str) -> bool:
    """Verify that ViSoBERT-HSD-Span model can run inference (Token Classification)."""
    try:
        from optimum.onnxruntime import ORTModelForTokenClassification
        from transformers import AutoTokenizer
        import torch
        
        print(f"    🔍 Verifying {model_name} model...")
        
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = ORTModelForTokenClassification.from_pretrained(
            model_path,
            provider="CPUExecutionProvider"
        )
        
        test_texts = [
            "Xin chào bạn, hôm nay thời tiết đẹp quá!",
            "thằng ngu này sao mà chậm quá",
        ]
        
        label_map = {0: "O", 1: "B-T", 2: "I-T"}
        
        for text in test_texts:
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=64)
            outputs = model(**inputs)
            logits = outputs.logits
            pred_ids = logits.argmax(-1)[0].tolist()
            
            # Count toxic tokens
            toxic_count = sum(1 for pid in pred_ids if pid != 0)
            status = f"{toxic_count} toxic tokens" if toxic_count > 0 else "CLEAN"
            
            print(f"       \"{text[:35]}...\" → {status}")
        
        return True
        
    except Exception as e:
        print_error(f"Verification failed: {e}")
        return False


def setup_visobert(force: bool = False) -> bool:
    """
    Setup ViSoBERT-HSD-Span model with ONNX conversion and INT8 quantization.
    
    Returns:
        True if successful, False otherwise
    """
    print_header("Setting up ViSoBERT-HSD-Span (Content Moderation - Span Detection)")
    
    print_info(f"Model: {VISOBERT_MODEL_NAME}")
    print_info(f"Output: {VISOBERT_DIR}")
    
    # Check if already setup
    int8_model = VISOBERT_INT8_DIR / "model_quantized.onnx"
    
    if int8_model.exists() and not force:
        size_mb = get_dir_size_mb(VISOBERT_INT8_DIR)
        print_success(f"ViSoBERT-HSD-Span already set up ({size_mb:.1f} MB)")
        
        # Quick verification
        if verify_visobert(VISOBERT_INT8_DIR, "INT8"):
            return True
    
    # Check dependencies
    try:
        import optimum
        import transformers
        import onnxruntime
    except ImportError as e:
        print_error(f"Missing dependency: {e}")
        print_info("Install with: pip install transformers optimum[onnxruntime] onnxruntime")
        return False
    
    success = True
    
    # Step 1: Download and convert to ONNX
    onnx_exists = (VISOBERT_ONNX_DIR / "model.onnx").exists()
    
    if not onnx_exists or force:
        print_step("Downloading and converting to ONNX...")
        ok, _ = download_and_convert_visobert(VISOBERT_MODEL_NAME, VISOBERT_ONNX_DIR)
        if not ok:
            return False
    else:
        print_skip("ONNX model already exists")
    
    # Step 2: Quantize to INT8
    int8_exists = int8_model.exists()
    
    if not int8_exists or force:
        print_step("Quantizing to INT8...")
        if not quantize_visobert(VISOBERT_ONNX_DIR, VISOBERT_INT8_DIR):
            success = False
    else:
        print_skip("INT8 model already exists")
    
    # Step 3: Verify
    if success:
        print_step("Verifying models...")
        verify_visobert(VISOBERT_INT8_DIR, "INT8")
        
        # Print size comparison
        print_step("Model sizes:")
        if VISOBERT_ONNX_DIR.exists():
            onnx_size = get_dir_size_mb(VISOBERT_ONNX_DIR)
            print(f"       ONNX FP32: {onnx_size:.1f} MB")
        
        if VISOBERT_INT8_DIR.exists():
            int8_size = get_dir_size_mb(VISOBERT_INT8_DIR)
            print(f"       ONNX INT8: {int8_size:.1f} MB")
            
            if VISOBERT_ONNX_DIR.exists():
                reduction = (1 - int8_size / onnx_size) * 100
                print(f"       Reduction: {reduction:.1f}%")
    
    if success:
        print_success("ViSoBERT-HSD-Span setup complete!")
    else:
        print_error("ViSoBERT-HSD-Span setup had errors.")
    
    return success


# ============================================================================
# Verification
# ============================================================================

def verify_all_models() -> bool:
    """Verify all models are properly set up."""
    print_header("Verifying All Models")
    
    all_ok = True
    
    # Check Zipformer
    print_step("Checking Zipformer...")
    zipformer_files = [
        "encoder-epoch-20-avg-10.int8.onnx",
        "decoder-epoch-20-avg-10.int8.onnx",
        "joiner-epoch-20-avg-10.int8.onnx",
        "bpe.model",
        "tokens.txt",
    ]
    
    zipformer_ok = True
    for f in zipformer_files:
        path = ZIPFORMER_DIR / f
        if path.exists():
            print_success(f"{f}")
        else:
            print_error(f"Missing: {f}")
            zipformer_ok = False
    
    if zipformer_ok:
        size_mb = get_dir_size_mb(ZIPFORMER_DIR)
        print_info(f"Total size: {size_mb:.1f} MB")
    
    all_ok = all_ok and zipformer_ok
    
    # Check ViSoBERT-HSD
    print_step("Checking ViSoBERT-HSD...")
    visobert_files = [
        ("onnx-int8/model_quantized.onnx", True),
        ("onnx-int8/tokenizer.json", True),
        ("onnx/model.onnx", False),  # Optional
    ]
    
    visobert_ok = True
    for f, required in visobert_files:
        path = VISOBERT_DIR / f
        if path.exists():
            print_success(f"{f}")
        else:
            if required:
                print_error(f"Missing: {f}")
                visobert_ok = False
            else:
                print_skip(f"Optional: {f}")
    
    if visobert_ok and VISOBERT_INT8_DIR.exists():
        size_mb = get_dir_size_mb(VISOBERT_INT8_DIR)
        print_info(f"INT8 size: {size_mb:.1f} MB")
        
        # Quick inference test
        verify_visobert(VISOBERT_INT8_DIR, "INT8")
    
    all_ok = all_ok and visobert_ok
    
    return all_ok


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Setup AI models for Vietnamese Speech-to-Text",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python scripts/setup_models.py              # Setup all models
    python scripts/setup_models.py --zipformer  # Setup Zipformer only
    python scripts/setup_models.py --visobert   # Setup ViSoBERT-HSD only
    python scripts/setup_models.py --verify     # Verify existing models
    python scripts/setup_models.py --force      # Force re-download
        """
    )
    
    parser.add_argument("--zipformer", action="store_true", help="Setup Zipformer model only")
    parser.add_argument("--visobert", action="store_true", help="Setup ViSoBERT-HSD model only")
    parser.add_argument("--verify", action="store_true", help="Only verify existing models")
    parser.add_argument("--force", "-f", action="store_true", help="Force re-download even if exists")
    
    args = parser.parse_args()
    
    print_header("Vietnamese Speech-to-Text Model Setup")
    print(f"\nProject Root: {PROJECT_ROOT}")
    print(f"Models Directory: {MODELS_DIR}")
    
    # Ensure models directory exists
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Verify only mode
    if args.verify:
        success = verify_all_models()
        return 0 if success else 1
    
    results = {}
    
    # Determine which models to setup
    setup_all = not args.zipformer and not args.visobert
    
    # Setup Zipformer
    if setup_all or args.zipformer:
        results["Zipformer"] = setup_zipformer(force=args.force)
    
    # Setup ViSoBERT-HSD
    if setup_all or args.visobert:
        results["ViSoBERT-HSD"] = setup_visobert(force=args.force)
    
    # Print summary
    print_header("Setup Summary")
    
    for model, success in results.items():
        status = "✅ Success" if success else "❌ Failed"
        print(f"  {model}: {status}")
    
    all_success = all(results.values())
    
    if all_success:
        print("\n" + "=" * 60)
        print("  🎉 All models set up successfully!")
        print("=" * 60)
        print("\nNext steps:")
        print("  1. cd backend")
        print("  2. python run.py")
        print("  3. Open http://localhost:8000/docs")
        return 0
    else:
        print("\n" + "=" * 60)
        print("  ⚠️  Some models failed to set up")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
