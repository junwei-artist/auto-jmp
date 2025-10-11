#!/usr/bin/env python3
"""
Test JMP with a very simple JSL script
"""

import subprocess
import time
from pathlib import Path

# Create a very simple test JSL script
simple_jsl = '''// Simple test
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

print("Created simple test JSL script")
print("Content:")
print(simple_jsl)
print("\n" + "="*50)

try:
    # Open JMP with the test script
    print("Opening JMP with simple test script...")
    subprocess.run(["open", str(test_jsl_path)], check=True)
    
    print("Waiting 10 seconds for JMP to load and execute...")
    time.sleep(10)
    
    # Check for generated images
    current_dir = Path(".")
    png_files = list(current_dir.glob("*.png"))
    print(f"Found {len(png_files)} PNG files:")
    for png in png_files:
        print(f"  - {png}")
        print(f"    Size: {png.stat().st_size} bytes")
    
    # Try to close JMP
    print("Closing JMP...")
    subprocess.run(["osascript", "-e", 'tell application "JMP" to quit'], 
                  capture_output=True, timeout=10)
    
except Exception as e:
    print(f"Error: {e}")

finally:
    # Clean up test file
    if test_jsl_path.exists():
        test_jsl_path.unlink()
        print("Cleaned up test JSL file")
    
    # Clean up any generated images
    for png in Path(".").glob("*.png"):
        if png.name.startswith("simple_test"):
            png.unlink()
            print(f"Cleaned up {png}")
