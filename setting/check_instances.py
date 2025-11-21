#!/usr/bin/env python3
"""
Simple verification that only one backend instance is running.
"""

import subprocess
import re

def check_backend_instances():
    """Check how many backend instances are running."""
    print("🔍 Checking Backend Instances")
    print("=" * 40)
    
    # Check for uvicorn processes
    result = subprocess.run(
        ["ps", "aux"],
        capture_output=True,
        text=True
    )
    
    backend_processes = []
    for line in result.stdout.split('\n'):
        if 'uvicorn main:app' in line and 'grep' not in line:
            backend_processes.append(line.strip())
    
    print(f"Found {len(backend_processes)} backend instance(s):")
    
    for i, process in enumerate(backend_processes, 1):
        # Extract PID and port
        pid_match = re.search(r'(\d+)\s+', process)
        port_match = re.search(r'--port\s+(\d+)', process)
        
        pid = pid_match.group(1) if pid_match else "unknown"
        port = port_match.group(1) if port_match else "unknown"
        
        print(f"  Instance {i}: PID {pid} on port {port}")
    
    if len(backend_processes) == 1:
        print("\n✅ Perfect! Only one backend instance running.")
    elif len(backend_processes) == 0:
        print("\n⚠️  No backend instances running.")
    else:
        print(f"\n⚠️  Multiple backend instances ({len(backend_processes)}) running.")
        print("   Consider killing extra instances to avoid conflicts.")

if __name__ == "__main__":
    check_backend_instances()
