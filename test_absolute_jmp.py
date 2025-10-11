#!/usr/bin/env python3
"""
Test JMP with absolute paths
"""

import subprocess
import time
from pathlib import Path

# Get absolute paths
csv_path = Path("/Users/sun.jun.wei2/Documents/GitHub/auto-jmp/demo/jmp_data_20251011_164149.csv").resolve()
output_path = Path("/Users/sun.jun.wei2/Documents/GitHub/auto-jmp").resolve()

# Create a test JSL script with absolute paths
test_jsl = f'''// Test script with absolute paths
Open("{csv_path}");

// Create a simple distribution
Distribution(
    Y( :Data )
);

// Save it with absolute path
Save Picture( "{output_path}/absolute_test.png", PNG );
'''

# Write the test script
test_jsl_path = Path("absolute_test.jsl")
test_jsl_path.write_text(test_jsl)

print("Created absolute path test JSL script")
print("CSV path:", csv_path)
print("Output path:", output_path)
print("Content:")
print(test_jsl)
print("\n" + "="*50)

try:
    # Open JMP with the test script
    print("Opening JMP with absolute path test script...")
    subprocess.run(["open", str(test_jsl_path)], check=True)
    
    print("Waiting 5 seconds for JMP to load...")
    time.sleep(5)
    
    # Try to execute the script manually using AppleScript
    print("Trying to execute script manually...")
    
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
    
    print("Waiting 15 seconds for script to execute...")
    time.sleep(15)
    
    # Check for generated images
    png_files = list(output_path.glob("*.png"))
    print(f"Found {len(png_files)} PNG files in {output_path}:")
    for png in png_files:
        print(f"  - {png}")
        print(f"    Size: {png.stat().st_size} bytes")
    
    # Also check current directory
    current_dir = Path(".")
    png_files_current = list(current_dir.glob("*.png"))
    print(f"Found {len(png_files_current)} PNG files in current directory:")
    for png in png_files_current:
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
    
    # Clean up any generated images
    for png in output_path.glob("absolute_test.png"):
        png.unlink()
        print(f"Cleaned up {png}")
