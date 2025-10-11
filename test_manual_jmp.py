#!/usr/bin/env python3
"""
Test JMP with manual script execution
"""

import subprocess
import time
from pathlib import Path

# Create a test JSL script without auto-run flag
test_jsl = '''// Test script without auto-run
Open("demo/jmp_data_20251011_164149.csv");

// Create a simple distribution
Distribution(
    Y( :Data )
);

// Save it
Save Picture( "manual_test.png", PNG );
'''

# Write the test script
test_jsl_path = Path("manual_test.jsl")
test_jsl_path.write_text(test_jsl)

print("Created manual test JSL script")
print("Content:")
print(test_jsl)
print("\n" + "="*50)

try:
    # Open JMP with the test script
    print("Opening JMP with manual test script...")
    subprocess.run(["open", str(test_jsl_path)], check=True)
    
    print("Waiting 5 seconds for JMP to load...")
    time.sleep(5)
    
    # Try to execute the script manually using AppleScript
    print("Trying to execute script manually...")
    
    # Method 1: Try Cmd+R
    applescript_cmd = '''
    tell application "System Events"
        tell application process "JMP"
            set frontmost to true
            delay 1
            keystroke "r" using {command down}
        end tell
    end tell
    '''
    
    result = subprocess.run(["osascript", "-e", applescript_cmd], 
                           capture_output=True, text=True, timeout=10)
    print(f"AppleScript result: {result.returncode}")
    if result.stdout:
        print(f"AppleScript stdout: {result.stdout}")
    if result.stderr:
        print(f"AppleScript stderr: {result.stderr}")
    
    print("Waiting 10 seconds for script to execute...")
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
        if png.name.startswith("manual_test"):
            png.unlink()
            print(f"Cleaned up {png}")
