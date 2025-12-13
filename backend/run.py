#!/usr/bin/env python3
"""
Backend Runner Script
=====================
Simple script to run the backend server with sensible defaults.

Usage:
    python run.py              # Development mode (default)
    python run.py --prod       # Production mode
    python run.py --port 8080  # Custom port
    
Equivalent to:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Author: Vietnamese STT Project
"""
import argparse
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(
        description="Run the Vietnamese STT Backend Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run.py                    # Development mode with hot reload
    python run.py --prod             # Production mode (no reload)
    python run.py --port 8080        # Use custom port
    python run.py --host 127.0.0.1   # Bind to localhost only
        """
    )
    
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=8000,
        help="Port to listen on (default: 8000)"
    )
    parser.add_argument(
        "--prod", "--production",
        action="store_true",
        help="Run in production mode (no reload, optimized)"
    )
    parser.add_argument(
        "--workers", "-w",
        type=int,
        default=1,
        help="Number of worker processes (default: 1, only for prod mode)"
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default=None,
        choices=["debug", "info", "warning", "error", "critical"],
        help="Log level (default: debug for dev, info for prod)"
    )
    
    args = parser.parse_args()
    
    # Import uvicorn here to allow script to run even if not installed
    try:
        import uvicorn
    except ImportError:
        print("❌ uvicorn not installed. Run: pip install uvicorn[standard]")
        sys.exit(1)
    
    # Determine log level
    if args.log_level:
        log_level = args.log_level
    else:
        log_level = "info" if args.prod else "debug"
    
    # Build uvicorn config
    config = {
        "app": "main:app",
        "host": args.host,
        "port": args.port,
        "log_level": log_level,
    }
    
    if args.prod:
        # Production mode
        print("=" * 50)
        print("  🚀 Starting in PRODUCTION mode")
        print("=" * 50)
        config.update({
            "workers": args.workers,
            "loop": "uvloop",
            "http": "httptools",
            "access_log": False,
        })
    else:
        # Development mode
        print("=" * 50)
        print("  🔧 Starting in DEVELOPMENT mode")
        print("=" * 50)
        config.update({
            "reload": True,
            "reload_dirs": ["app"],
        })
    
    print(f"  Host: {args.host}")
    print(f"  Port: {args.port}")
    print(f"  Log Level: {log_level}")
    print(f"  API Docs: http://localhost:{args.port}/docs")
    print("=" * 50)
    print()
    
    # Run server
    uvicorn.run(**config)


if __name__ == "__main__":
    main()
