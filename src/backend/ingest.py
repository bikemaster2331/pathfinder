from pipeline import Pipeline
from pathlib import Path
import sys
import shutil
import os

BASE_DIR = Path(__file__).parent
DATASET_FILE = BASE_DIR / "dataset" / "dataset.json"
CONFIG = BASE_DIR / "config" / "config.yaml"
CHROMA_STORAGE = BASE_DIR / "chroma_storage"

def main():
    print("========================================")
    print("   PATHFINDER FACTORY RESET & INGEST    ")
    print("========================================")

    if CHROMA_STORAGE.exists():
        print(f"🗑️  Wiping old brain storage...")
        try:
            shutil.rmtree(CHROMA_STORAGE)
            print("   - Storage deleted successfully.")
        except Exception as e:
            print(f"⚠️  Warning: Could not delete folder (Is the app running?): {e}")


    print("⚙️  Initializing fresh Pipeline...")
    try:
        pipeline = Pipeline(
            dataset_path=str(DATASET_FILE),
            config_path=str(CONFIG)
        )
    except Exception as e:
        print(f"Failed to initialize pipeline: {e}")
        sys.exit(1)



    pipeline.rebuild_index()

    print("========================================")
    print("   DONE. System is clean and updated.   ")
    print("========================================")

if __name__ == "__main__":
    main()