#!/usr/bin/env python3
"""
Auto-JMP Settings Tool - File Paths Demo
This script demonstrates the new file path functionality.
"""

import sys
import json
from pathlib import Path

# Add the project root to Python path
current_dir = Path(__file__).parent
project_root = current_dir.parent
sys.path.insert(0, str(project_root))

from setting.utils import SettingsManager

def demo_file_paths():
    """Demonstrate the file path functionality."""
    print("🧰 Auto-JMP Settings Tool - File Paths Demo")
    print("=" * 60)
    print()
    
    manager = SettingsManager()
    
    # File Paths
    print("📁 CONFIGURATION FILE PATHS")
    print("-" * 30)
    file_paths = manager._get_config_file_paths()
    for name, path in file_paths.items():
        print(f"{name}: {path}")
    print()
    
    # File Status
    print("📊 FILE STATUS")
    print("-" * 30)
    file_status = manager._get_config_file_status()
    for name, status in file_status.items():
        exists = "✅" if status["exists"] else "❌"
        size = f"{status['size']} bytes" if status["size"] > 0 else "0 bytes"
        readable = "R" if status["readable"] else "-"
        writable = "W" if status["writable"] else "-"
        print(f"{exists} {name}:")
        print(f"   Path: {status['path']}")
        print(f"   Size: {size}")
        print(f"   Permissions: {readable}{writable}")
    print()
    
    # Configuration Summary
    print("📋 CONFIGURATION SUMMARY")
    print("-" * 30)
    summary = manager.get_configuration_summary()
    
    print("Key Settings:")
    for key, value in summary["key_settings"].items():
        print(f"  {key}: {value}")
    print()
    
    print("Configuration Sources:")
    for source, info in summary["configuration_sources"].items():
        exists = "✅" if info["exists"] else "❌"
        print(f"  {exists} {source.upper()}:")
        print(f"    File: {info['source_file']}")
        print(f"    Variables: {info['count']}")
        print(f"    List: {', '.join(info['variables'][:5])}{'...' if len(info['variables']) > 5 else ''}")
    print()
    
    # Recommendations
    if summary["recommendations"]:
        print("💡 RECOMMENDATIONS")
        print("-" * 30)
        for i, rec in enumerate(summary["recommendations"], 1):
            print(f"{i}. {rec}")
        print()
    
    # Quick Reference
    print("🔗 QUICK REFERENCE")
    print("-" * 30)
    print("To check/edit configuration files:")
    print(f"Backend:  cat {file_paths['backend_env']}")
    print(f"Frontend: cat {file_paths['frontend_env']}")
    print(f"Root:     cat {file_paths['root_env']}")
    print()
    print("To edit with your preferred editor:")
    print(f"Backend:  code {file_paths['backend_env']}")
    print(f"Frontend: code {file_paths['frontend_env']}")
    print()
    
    print("🎉 File path functionality demo completed!")
    print()
    print("🚀 To use the web interface:")
    print("   python -m setting")
    print("   Then open: http://localhost:4900")
    print("   Go to 'Diagnostics' tab → 'Show File Paths'")

if __name__ == "__main__":
    demo_file_paths()
