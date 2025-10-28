import sys
import os

# Check if required packages are available (verify we're using venv)
try:
    import sqlalchemy
except ImportError:
    venv_python = os.path.join(os.path.dirname(__file__), "venv", "Scripts", "python.exe")
    if os.path.exists(venv_python):
        print("ERROR: You must use the virtual environment Python!")
        print(f"\nPlease run one of the following:")
        print(f"  1. {venv_python} run.py")
        print(f"  2. .\\venv\\Scripts\\python.exe run.py")
        print(f"  3. Use the launcher: start.bat or start.ps1")
        print(f"\nCurrent Python: {sys.executable}")
        sys.exit(1)
    else:
        print("ERROR: Required packages not found. Please install dependencies:")
        print("  pip install -r requirements.txt")
        sys.exit(1)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["src"],  # Explicitly watch the src directory
        reload_includes=["*.py"],  # Only reload on Python file changes
    )
