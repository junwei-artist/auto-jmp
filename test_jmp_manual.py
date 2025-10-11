#!/usr/bin/env python3
"""
Simple test script to manually test JMP execution
"""

import subprocess
import time
import os
from pathlib import Path

# Create a simple test JSL script
test_jsl_content = '''// Simple test script
Open("demo/jmp_data_20251011_164149.csv");

// Create a simple distribution plot
Distribution(
    Y( :Data ),
    Horizontal Layout( 1 ),
    Vertical( 0 )
);

// Save the plot
Save Picture( "test_output.png", PNG );
'''

# Write test JSL file
test_jsl_path = Path("test_simple.jsl")
test_jsl_path.write_text(test_jsl_content)

print("Created simple test JSL script")
print("Content:")
print(test_jsl_content)
print("\n" + "="*50)

try:
    # Open JMP with the test script
    print("Opening JMP with test script...")
    subprocess.run(["open", str(test_jsl_path)], check=True)
    
    print("Waiting 5 seconds for JMP to load...")
    time.sleep(5)
    
    # Check if JMP is running
    result = subprocess.run(["pgrep", "-f", "JMP"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"JMP is running with PID: {result.stdout.strip()}")
    else:
        print("JMP is not running")
    
    print("Waiting 10 more seconds to see if images are generated...")
    time.sleep(10)
    
    # Check for generated images
    current_dir = Path(".")
    png_files = list(current_dir.glob("*.png"))
    print(f"Found {len(png_files)} PNG files:")
    for png in png_files:
        print(f"  - {png}")
    
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
