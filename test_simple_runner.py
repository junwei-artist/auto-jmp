#!/usr/bin/env python3
"""
Test with a very simple JSL script to see if basic functionality works
"""

import subprocess
import time
from pathlib import Path

# Create a very simple JSL script
simple_jsl = '''// Very simple test
Open("demo/jmp_data_20251011_164149.csv");

// Just create a simple distribution
Distribution(
    Y( :Data )
);

// Save it
Save Picture( "simple_test.png", PNG );
'''

# Write the test script
test_jsl_path = Path("simple_test.jsl")
test_jsl_path.write_text(simple_jsl)

print("Created very simple test JSL script")
print("Content:")
print(simple_jsl)
print("\n" + "="*50)

try:
    # Test with our modular script
    print("Testing with jmp_runner.py...")
    result = subprocess.run([
        "python", "jmp_runner.py", 
        "demo/jmp_data_20251011_164149.csv", 
        "simple_test.jsl",
        "--max-wait", "120",
        "--verbose"
    ], capture_output=True, text=True, timeout=180)
    
    print(f"Return code: {result.returncode}")
    print("STDOUT:")
    print(result.stdout)
    if result.stderr:
        print("STDERR:")
        print(result.stderr)
    
    # Check for generated images
    current_dir = Path(".")
    png_files = list(current_dir.glob("*.png"))
    print(f"\nFound {len(png_files)} PNG files in current directory:")
    for png in png_files:
        print(f"  - {png}")
        print(f"    Size: {png.stat().st_size} bytes")
    
    # Check task directories
    tasks_dir = Path("tasks")
    if tasks_dir.exists():
        task_dirs = [d for d in tasks_dir.iterdir() if d.is_dir() and d.name.startswith("task_")]
        if task_dirs:
            latest_task = max(task_dirs, key=lambda x: x.stat().st_mtime)
            print(f"\nLatest task directory: {latest_task}")
            task_png_files = list(latest_task.glob("*.png"))
            print(f"Found {len(task_png_files)} PNG files in task directory:")
            for png in task_png_files:
                print(f"  - {png}")
                print(f"    Size: {png.stat().st_size} bytes")
    
except Exception as e:
    print(f"Error: {e}")

finally:
    # Clean up test file
    if test_jsl_path.exists():
        test_jsl_path.unlink()
        print("Cleaned up test JSL file")
    
    # Clean up any generated images
    for png in Path(".").glob("simple_test.png"):
        png.unlink()
        print(f"Cleaned up {png}")
