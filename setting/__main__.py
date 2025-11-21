"""
Auto-JMP Settings Tool - Main Entry Point
Run with: python -m setting
"""
import sys
import os
from pathlib import Path

# Get the project root directory (parent of setting directory)
current_dir = Path(__file__).parent
project_root = current_dir.parent

# Add the project root to Python path so we can import from setting
sys.path.insert(0, str(project_root))

# Change to the project root directory
os.chdir(project_root)

def main():
    """Main entry point for the settings tool."""
    print("🧰 Auto-JMP Settings Tool")
    print("=" * 50)
    print()
    
    # Check if virtual environment exists
    venv_path = current_dir / "venv"
    if not venv_path.exists():
        print("❌ Virtual environment not found!")
        print("Please run the setup script first to create the virtual environment.")
        return 1
    
    # Check if dependencies are installed
    try:
        import flask
        import flask_cors
        import psycopg2
        import redis
        import requests
        from dotenv import load_dotenv
    except ImportError as e:
        print(f"❌ Missing dependencies: {e}")
        print("Please install dependencies with: pip install -r requirements.txt")
        return 1
    
    print("✅ All dependencies found")
    print()
    
    # Import and run the configuration wizard
    try:
        from setting.config_wizard import main as wizard_main
        wizard_main()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        return 0
    except Exception as e:
        print(f"❌ Error running configuration wizard: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())
