#!/usr/bin/env python3
"""
URL Checker Script
==================
Validates all model download URLs before setup.
Useful for debugging download issues or verifying URL availability.

Usage:
    python scripts/check_url.py              # Check all URLs
    python scripts/check_url.py --zipformer  # Check Zipformer URLs only
    python scripts/check_url.py --visobert   # Check ViSoBERT URLs only
    python scripts/check_url.py --url "https://example.com/file.bin"
"""
import urllib.request
import urllib.error
import argparse
import sys
from typing import List, Tuple, Dict

# Model URLs to check
# Note: tokens.txt is not hosted on HuggingFace - it's generated from bpe.model
ZIPFORMER_URLS = {
    "Zipformer - encoder": "https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h/resolve/main/encoder-epoch-20-avg-10.int8.onnx",
    "Zipformer - decoder": "https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h/resolve/main/decoder-epoch-20-avg-10.int8.onnx",
    "Zipformer - joiner": "https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h/resolve/main/joiner-epoch-20-avg-10.int8.onnx",
    "Zipformer - bpe.model": "https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h/resolve/main/bpe.model",
}

VISOBERT_URLS = {
    "ViSoBERT-HSD - config": "https://huggingface.co/visolex/visobert-hsd/resolve/main/config.json",
    "ViSoBERT-HSD - model": "https://huggingface.co/visolex/visobert-hsd/resolve/main/model.safetensors",
    "ViSoBERT-HSD - tokenizer": "https://huggingface.co/visolex/visobert-hsd/resolve/main/tokenizer.json",
    "ViSoBERT-HSD - vocab": "https://huggingface.co/visolex/visobert-hsd/resolve/main/vocab.txt",
}


def check_url(url: str, name: str = None) -> Tuple[bool, str]:
    """
    Check if a URL is accessible.
    
    Args:
        url: URL to check
        name: Display name for the URL
        
    Returns:
        Tuple of (success: bool, message: str)
    """
    display_name = name or url
    try:
        # Create request with User-Agent to avoid 403 blocks
        request = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; URL-Checker/1.0)'}
        )
        
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
            content_length = response.headers.get('Content-Length', 'unknown')
            return True, f"✅ {display_name}\n   Status: {status}, Size: {content_length} bytes"
            
    except urllib.error.HTTPError as e:
        return False, f"❌ {display_name}\n   HTTP Error: {e.code} {e.reason}"
    except urllib.error.URLError as e:
        return False, f"❌ {display_name}\n   URL Error: {e.reason}"
    except TimeoutError:
        return False, f"❌ {display_name}\n   Timeout: Request took too long"
    except Exception as e:
        return False, f"❌ {display_name}\n   Error: {e}"


def check_urls_group(urls: Dict[str, str], title: str) -> List[Tuple[bool, str]]:
    """Check a group of URLs and return results."""
    results = []
    
    print("=" * 60)
    print(f"Checking {title} Download URLs")
    print("=" * 60)
    
    for name, url in urls.items():
        print(f"\nChecking: {name}...")
        success, message = check_url(url, name)
        results.append((success, message))
        print(message)
    
    return results


def check_all_urls(check_zipformer: bool = True, check_visobert: bool = True) -> List[Tuple[bool, str]]:
    """Check all predefined model URLs."""
    results = []
    
    if check_zipformer:
        results.extend(check_urls_group(ZIPFORMER_URLS, "Zipformer Model"))
    
    if check_visobert:
        if check_zipformer:
            print()  # Add spacing between groups
        results.extend(check_urls_group(VISOBERT_URLS, "ViSoBERT-HSD Model"))
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description="Check model download URLs for accessibility"
    )
    parser.add_argument(
        "--url", "-u",
        type=str,
        help="Check a specific URL instead of all predefined URLs"
    )
    parser.add_argument(
        "--zipformer", "-z",
        action="store_true",
        help="Check Zipformer model URLs only"
    )
    parser.add_argument(
        "--visobert", "-b",
        action="store_true",
        help="Check ViSoBERT-HSD model URLs only"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output"
    )
    
    args = parser.parse_args()
    
    if args.url:
        # Check single URL
        print(f"Checking URL: {args.url}")
        success, message = check_url(args.url)
        print(message)
        sys.exit(0 if success else 1)
    else:
        # Determine which models to check
        # If neither flag is set, check both
        check_zipformer = args.zipformer or (not args.zipformer and not args.visobert)
        check_visobert = args.visobert or (not args.zipformer and not args.visobert)
        
        # Check predefined URLs
        results = check_all_urls(check_zipformer, check_visobert)
        
        # Summary
        success_count = sum(1 for success, _ in results if success)
        total_count = len(results)
        
        print("\n" + "=" * 60)
        print(f"Summary: {success_count}/{total_count} URLs accessible")
        print("=" * 60)
        
        if success_count < total_count:
            print("\n⚠️  Some URLs are not accessible. This may affect model setup.")
            print("   Check your internet connection or try again later.")
            sys.exit(1)
        else:
            print("\n✅ All URLs are accessible. You can proceed with model setup.")
            sys.exit(0)


if __name__ == "__main__":
    main()
