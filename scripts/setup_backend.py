#!/usr/bin/env python3
"""
Backend Auto-Setup Script
=========================
Complete setup script for new users cloning the Vietnamese Speech-to-Text repository.
This script automates the entire backend setup process including:
- Python virtual environment creation
- Dependency installation  
- Zipformer & ViSoBERT-HSD model download
- Database initialization
- Environment configuration
- Health checks

Usage:
    python scripts/setup_backend.py                # Full setup (both models)
    python scripts/setup_backend.py --skip-models  # Skip model downloads
    python scripts/setup_backend.py --verify       # Only run verification
    python scripts/setup_backend.py --zipformer    # Setup only Zipformer
    python scripts/setup_backend.py --visobert     # Setup only ViSoBERT-HSD

Requirements:
    - Python 3.10+ installed and in PATH
    - ~500MB disk space for both models
    - Internet connection

Author: Auto-generated for Vietnamese STT Project
"""
import os
import sys
import shutil
import argparse
import subprocess
import urllib.request
from pathlib import Path
from typing import List, Tuple, Optional
import json

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
MODELS_DIR = BACKEND_DIR / "models_storage"
VENV_DIR = BACKEND_DIR / "env"
REQUIREMENTS_FILE = BACKEND_DIR / "requirements.txt"
DATABASE_FILE = BACKEND_DIR / "database.db"
ENV_FILE = BACKEND_DIR / ".env"

MIN_PYTHON_VERSION = (3, 10)
RECOMMENDED_PYTHON_VERSION = (3, 11)

# ============================================================================
# Utility Functions
# ============================================================================

def print_banner():
    """Print the setup banner."""
    banner = """
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🎤 Vietnamese Speech-to-Text Backend Setup                ║
║                                                              ║
║    Real-time transcription with Zipformer + ViSoBERT-HSD     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)


def print_header(title: str):
    """Print a formatted section header."""
    print("\n" + "=" * 60)
    print(f"  📋 {title}")
    print("=" * 60)


def print_step(step: str, status: str = ""):
    """Print a step with optional status."""
    if status:
        print(f"\n  → {step}: {status}")
    else:
        print(f"\n  → {step}")


def print_success(message: str):
    """Print a success message."""
    print(f"  ✅ {message}")


def print_error(message: str):
    """Print an error message."""
    print(f"  ❌ {message}")


def print_warning(message: str):
    """Print a warning message."""
    print(f"  ⚠️  {message}")


def print_info(message: str):
    """Print an info message."""
    print(f"  ℹ️  {message}")


def run_command(
    cmd: List[str],
    cwd: Optional[Path] = None,
    capture_output: bool = True,
    check: bool = True
) -> subprocess.CompletedProcess:
    """
    Run a command and return the result.
    
    Args:
        cmd: Command and arguments
        cwd: Working directory
        capture_output: Capture stdout/stderr
        check: Raise on non-zero exit
        
    Returns:
        CompletedProcess result
    """
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or PROJECT_ROOT,
            capture_output=capture_output,
            text=True,
            check=check
        )
        return result
    except subprocess.CalledProcessError as e:
        if capture_output:
            print_error(f"Command failed: {' '.join(cmd)}")
            if e.stderr:
                print(f"    Error: {e.stderr[:500]}")
        raise


def check_python_version() -> Tuple[bool, str]:
    """
    Check if Python version meets requirements.
    
    Returns:
        Tuple of (is_valid, message)
    """
    version = sys.version_info[:2]
    version_str = f"{version[0]}.{version[1]}"
    
    if version < MIN_PYTHON_VERSION:
        return False, f"Python {version_str} is too old. Need Python {MIN_PYTHON_VERSION[0]}.{MIN_PYTHON_VERSION[1]}+"
    
    if version < RECOMMENDED_PYTHON_VERSION:
        return True, f"Python {version_str} works but {RECOMMENDED_PYTHON_VERSION[0]}.{RECOMMENDED_PYTHON_VERSION[1]}+ recommended"
    
    return True, f"Python {version_str} ✓"


def check_command_exists(command: str) -> bool:
    """Check if a command exists in PATH."""
    return shutil.which(command) is not None


def get_venv_python() -> Path:
    """Get the Python executable path for the virtual environment."""
    if sys.platform == "win32":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def get_venv_pip() -> Path:
    """Get the pip executable path for the virtual environment."""
    if sys.platform == "win32":
        return VENV_DIR / "Scripts" / "pip.exe"
    return VENV_DIR / "bin" / "pip"


# ============================================================================
# Setup Steps
# ============================================================================

def step_check_prerequisites() -> bool:
    """
    Step 1: Check all prerequisites are met.
    
    Returns:
        True if all prerequisites pass
    """
    print_header("Step 1: Checking Prerequisites")
    
    all_ok = True
    
    # Check Python version
    print_step("Python version")
    is_valid, message = check_python_version()
    if is_valid:
        print_success(message)
    else:
        print_error(message)
        all_ok = False
    
    # Check project structure
    print_step("Project structure")
    if not BACKEND_DIR.exists():
        print_error(f"Backend directory not found: {BACKEND_DIR}")
        all_ok = False
    elif not REQUIREMENTS_FILE.exists():
        print_error(f"Requirements file not found: {REQUIREMENTS_FILE}")
        all_ok = False
    else:
        print_success("Project structure valid ✓")
    
    # Check disk space (rough estimate)
    print_step("Disk space")
    try:
        import shutil
        total, used, free = shutil.disk_usage(PROJECT_ROOT)
        free_gb = free / (1024 ** 3)
        if free_gb < 1:
            print_warning(f"Low disk space: {free_gb:.1f}GB free (need ~200MB for model)")
        else:
            print_success(f"{free_gb:.1f}GB free ✓")
    except Exception:
        print_info("Could not check disk space")
    
    return all_ok


def step_create_venv() -> bool:
    """
    Step 2: Create Python virtual environment.
    
    Returns:
        True if successful
    """
    print_header("Step 2: Creating Virtual Environment")
    
    venv_python = get_venv_python()
    
    # Check if venv already exists and is valid
    if VENV_DIR.exists() and venv_python.exists():
        print_step("Existing venv found")
        try:
            result = run_command([str(venv_python), "--version"])
            print_success(f"Using existing venv: {result.stdout.strip()}")
            return True
        except Exception:
            print_warning("Existing venv is broken, recreating...")
            shutil.rmtree(VENV_DIR)
    
    print_step("Creating new virtual environment")
    print_info(f"Location: {VENV_DIR}")
    
    try:
        import venv
        venv.create(VENV_DIR, with_pip=True)
        
        # Verify
        if venv_python.exists():
            print_success("Virtual environment created ✓")
            return True
        else:
            print_error("Virtual environment creation failed")
            return False
            
    except Exception as e:
        print_error(f"Failed to create venv: {e}")
        return False


def step_install_dependencies() -> bool:
    """
    Step 3: Install Python dependencies.
    
    Returns:
        True if successful
    """
    print_header("Step 3: Installing Dependencies")
    
    venv_pip = get_venv_pip()
    venv_python = get_venv_python()
    
    if not venv_pip.exists():
        print_error(f"Pip not found at: {venv_pip}")
        return False
    
    # Upgrade pip first
    print_step("Upgrading pip")
    try:
        run_command([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"])
        print_success("Pip upgraded ✓")
    except Exception as e:
        print_warning(f"Pip upgrade failed (continuing anyway): {e}")
    
    # Install requirements
    print_step("Installing requirements.txt")
    print_info("This may take a few minutes...")
    
    try:
        result = run_command(
            [str(venv_pip), "install", "-r", str(REQUIREMENTS_FILE)],
            capture_output=False,  # Show progress
            check=True
        )
        print_success("Dependencies installed ✓")
        return True
    except Exception as e:
        print_error(f"Dependency installation failed: {e}")
        return False


def step_setup_models(model_type: str = "all") -> bool:
    """
    Step 4: Download and setup AI models.
    
    Args:
        model_type: "all", "zipformer", or "visobert"
        
    Returns:
        True if successful
    """
    print_header("Step 4: Setting Up AI Models")
    
    venv_python = get_venv_python()
    setup_models_script = SCRIPT_DIR / "setup_models.py"
    
    if not setup_models_script.exists():
        print_error(f"Model setup script not found: {setup_models_script}")
        return False
    
    # Build command based on model type
    cmd = [str(venv_python), str(setup_models_script)]
    
    if model_type == "zipformer":
        cmd.append("--zipformer")
        print_info("Downloading Zipformer model (~200MB)...")
    elif model_type == "visobert":
        cmd.append("--visobert")
        print_info("Setting up ViSoBERT-HSD model (~200MB + ONNX export)...")
    else:
        cmd.append("--all")
        print_info("Downloading both models (~500MB total)...")
    
    print_info("This may take a few minutes depending on your connection...")
    
    try:
        run_command(cmd, capture_output=False)
        print_success("Model setup completed ✓")
        return True
    except Exception as e:
        print_warning(f"Model setup failed: {e}")
        return False


def step_setup_database() -> bool:
    """
    Step 5: Initialize the database.
    
    Returns:
        True if successful
    """
    print_header("Step 5: Initializing Database")
    
    venv_python = get_venv_python()
    
    # Check if database already exists
    if DATABASE_FILE.exists():
        print_step("Database already exists")
        print_success(f"Using existing database: {DATABASE_FILE}")
        return True
    
    print_step("Creating database")
    
    # Initialize database by importing the app (which creates tables)
    init_script = '''
import sys
sys.path.insert(0, ".")
import asyncio
from app.core.database import init_db

async def main():
    await init_db()
    print("Database initialized")

asyncio.run(main())
'''
    
    init_file = BACKEND_DIR / "_init_db_temp.py"
    try:
        with open(init_file, "w") as f:
            f.write(init_script)
        
        run_command([str(venv_python), str(init_file)], cwd=BACKEND_DIR)
        print_success("Database initialized ✓")
        return True
        
    except Exception as e:
        print_warning(f"Database init failed (will be created on first run): {e}")
        return True  # Not critical
    finally:
        if init_file.exists():
            init_file.unlink()


def step_create_env_file() -> bool:
    """
    Step 6: Create .env file with default configuration.
    
    Returns:
        True if successful
    """
    print_header("Step 6: Creating Environment Configuration")
    
    if ENV_FILE.exists():
        print_step("Environment file already exists")
        print_success(f"Using existing: {ENV_FILE}")
        return True
    
    print_step("Creating .env file")
    
    env_content = """# Vietnamese Speech-to-Text Backend Configuration
# ================================================
# This file was auto-generated by setup_backend.py
# Modify as needed for your environment

# General Settings
PROJECT_NAME="Real-time Vietnamese STT"
DEBUG=false

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"]

# Model Storage Path (relative to backend/)
MODEL_STORAGE_PATH=models_storage

# Database
DATABASE_URL=sqlite+aiosqlite:///database.db
DATABASE_ECHO=false

# Logging Level: DEBUG, INFO, WARNING, ERROR
LOG_LEVEL=INFO
"""
    
    try:
        with open(ENV_FILE, "w") as f:
            f.write(env_content)
        print_success(f"Created: {ENV_FILE}")
        return True
    except Exception as e:
        print_warning(f"Could not create .env file: {e}")
        return True  # Not critical


def step_verify_installation() -> bool:
    """
    Step 7: Verify the installation is working.
    
    Returns:
        True if verification passes
    """
    print_header("Step 7: Verifying Installation")
    
    venv_python = get_venv_python()
    all_ok = True
    
    # Check Python packages
    print_step("Checking installed packages")
    
    critical_packages = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("sqlmodel", "SQLModel"),
        ("sherpa_onnx", "Sherpa-ONNX"),
    ]
    
    for package, name in critical_packages:
        try:
            result = run_command(
                [str(venv_python), "-c", f"import {package}; print({package}.__version__ if hasattr({package}, '__version__') else 'OK')"],
                check=False
            )
            if result.returncode == 0:
                print_success(f"{name} ✓")
            else:
                print_warning(f"{name} import failed")
        except Exception:
            print_warning(f"{name} check failed")
    
    # Check model directories
    print_step("Checking model directories")
    
    model_checks = [
        ("zipformer/hynt-zipformer-30M-6000h", "encoder-epoch-20-avg-10.int8.onnx", "Zipformer"),
        ("visobert-hsd/onnx-int8", "model.onnx", "ViSoBERT-HSD ONNX INT8"),
    ]
    
    for model_path, check_file, model_name in model_checks:
        model_dir = MODELS_DIR / model_path
        if model_dir.exists():
            if check_file and not (model_dir / check_file).exists():
                print_warning(f"{model_name}: directory exists but missing files")
            else:
                print_success(f"{model_name} ✓")
        else:
            print_warning(f"{model_name} not found (may need to run model setup)")
    
    # Test import of main app
    print_step("Testing application import")
    try:
        result = run_command(
            [str(venv_python), "-c", "from app.core.config import settings; print(f'Project: {settings.PROJECT_NAME}')"],
            cwd=BACKEND_DIR
        )
        print_success(f"Application imports OK ✓")
        print_info(result.stdout.strip())
    except Exception as e:
        print_warning(f"Application import test failed: {e}")
        all_ok = False
    
    return all_ok


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Main entry point for the setup script."""
    parser = argparse.ArgumentParser(
        description="Complete backend setup for Vietnamese Speech-to-Text",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python scripts/setup_backend.py                # Full setup (both models)
    python scripts/setup_backend.py --skip-models  # Skip model downloads
    python scripts/setup_backend.py --verify       # Only verify existing installation
    python scripts/setup_backend.py --zipformer    # Setup only Zipformer model
    python scripts/setup_backend.py --visobert     # Setup only ViSoBERT-HSD model

Notes:
    - Requires Python 3.10+
    - Full setup needs ~500MB disk space for both models
    - Model download may take a few minutes
        """
    )
    
    parser.add_argument(
        "--skip-models", "-s",
        action="store_true",
        help="Skip model downloads (dependencies only)"
    )
    parser.add_argument(
        "--verify", "-v",
        action="store_true",
        help="Only run verification checks"
    )
    parser.add_argument(
        "--no-venv",
        action="store_true",
        help="Skip venv creation (use system Python)"
    )
    parser.add_argument(
        "--zipformer", "-z",
        action="store_true",
        help="Setup only Zipformer model (skip ViSoBERT)"
    )
    parser.add_argument(
        "--visobert", "-b",
        action="store_true",
        help="Setup only ViSoBERT-HSD model (skip Zipformer)"
    )
    
    args = parser.parse_args()
    
    print_banner()
    
    print(f"Project Root: {PROJECT_ROOT}")
    print(f"Backend Dir:  {BACKEND_DIR}")
    print(f"Models Dir:   {MODELS_DIR}")
    
    # Only verify mode
    if args.verify:
        success = step_verify_installation()
        return 0 if success else 1
    
    # Determine which models to setup
    if args.zipformer and args.visobert:
        model_type = "all"
    elif args.zipformer:
        model_type = "zipformer"
    elif args.visobert:
        model_type = "visobert"
    else:
        model_type = "all"
    
    # Full setup
    steps = [
        ("Prerequisites", step_check_prerequisites),
    ]
    
    if not args.no_venv:
        steps.append(("Virtual Environment", step_create_venv))
    
    steps.append(("Dependencies", step_install_dependencies))
    
    if not args.skip_models:
        steps.append(("AI Models", lambda: step_setup_models(model_type)))
    
    steps.extend([
        ("Database", step_setup_database),
        ("Environment Config", step_create_env_file),
        ("Verification", step_verify_installation),
    ])
    
    # Run all steps
    results = {}
    for step_name, step_func in steps:
        try:
            results[step_name] = step_func()
        except Exception as e:
            print_error(f"Step '{step_name}' crashed: {e}")
            results[step_name] = False
        
        if not results[step_name] and step_name == "Prerequisites":
            print_error("\nPrerequisites not met. Please fix the issues above and try again.")
            return 1
    
    # Print summary
    print_header("Setup Summary")
    
    for step_name, success in results.items():
        status = "✅" if success else "⚠️"
        print(f"  {status} {step_name}")
    
    all_success = all(results.values())
    
    if all_success:
        print("\n" + "═" * 60)
        print("  🎉 Setup Complete!")
        print("═" * 60)
        
        # Print next steps
        print("\n📚 Next Steps:\n")
        
        if sys.platform == "win32":
            activate_cmd = r"backend\env\Scripts\Activate.ps1"
        else:
            activate_cmd = "source backend/env/bin/activate"
        
        print(f"  1. Activate virtual environment:")
        print(f"     {activate_cmd}\n")
        
        print(f"  2. Start the backend server:")
        print(f"     cd backend")
        print(f"     python main.py\n")
        
        print(f"  3. Open API docs:")
        print(f"     http://localhost:8000/docs\n")
        
        print(f"  4. For frontend setup, see: docs/docs-fe.md\n")
        
        return 0
    else:
        print("\n" + "═" * 60)
        print("  ⚠️  Setup completed with warnings")
        print("═" * 60)
        print("\nSome steps had issues. Check the messages above.")
        print("You may still be able to run the application.\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
