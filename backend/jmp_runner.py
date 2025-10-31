#!/usr/bin/env python3
"""
JMP Runner Module
================

A modular script for running JMP with CSV and JSL files to generate images.
This module extracts the core functionality from jmp_server_module.py for
standalone use without the Flask web server.

Features:
- Process CSV and JSL files
- Launch JMP and execute JSL scripts
- Generate images from JMP visualizations
- Monitor completion and collect results

Usage:
    from jmp_runner import JMPRunner
    
    runner = JMPRunner()
    result = runner.run_csv_jsl(csv_path="data.csv", jsl_path="script.jsl")
    print(f"Generated {len(result['images'])} images")
"""

import os
import time
import subprocess
import zipfile
import psutil
import json
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
import logging
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# Optional imports for advanced features
try:
    import applescript
    APPLESCRIPT_AVAILABLE = True
except ImportError:
    APPLESCRIPT_AVAILABLE = False
    print("Warning: applescript not available. Install with: pip install applescript")


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class JMPRunner:
    """
    Main class for running JMP with CSV and JSL files to generate images.
    """
    
    def __init__(self, 
                 base_task_dir: Optional[Union[str, Path]] = None,
                 max_wait_time: int = 300,
                 jmp_start_delay: int = 6):
        """
        Initialize JMP Runner.
        
        Args:
            base_task_dir: Directory to store task files (default: ./tasks)
            max_wait_time: Maximum time to wait for JMP completion (seconds)
            jmp_start_delay: Delay after opening JMP before running script (seconds)
        """
        self.base_task_dir = Path(base_task_dir) if base_task_dir else Path("/Users/lytech/Documents/service/auto-jmp/backend/tasks")
        self.max_wait_time = max_wait_time
        self.jmp_start_delay = jmp_start_delay
        
        # Create base task directory if it doesn't exist
        self.base_task_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"JMPRunner initialized with task directory: {self.base_task_dir}")
        if not APPLESCRIPT_AVAILABLE:
            logger.warning("AppleScript not available - JMP automation may not work properly")

    def _candidate_jmp_apps(self) -> List[str]:
        """Return ordered list of JMP application names/paths to try with `open -a`.
        Allows override via env vars: JMP_APP_PATH (full path) or JMP_APP_NAME.
        """
        candidates: List[str] = []
        env_path = os.getenv("JMP_APP_PATH")
        env_name = os.getenv("JMP_APP_NAME")
        if env_path:
            candidates.append(env_path)
        if env_name:
            candidates.append(env_name)
        # Common app bundle names
        candidates.extend([
            "JMP Pro 18",
            "JMP Pro 17",
            "JMP Pro 16",
            "JMP 18",
            "JMP 17",
            "JMP 16",
            "JMP",
        ])
        # Full default installation paths (if user provides env, those are tried first)
        candidates.extend([
            "/Applications/JMP Pro 18.app",
            "/Applications/JMP Pro 17.app",
            "/Applications/JMP Pro 16.app",
            "/Applications/JMP 18.app",
            "/Applications/JMP 17.app",
            "/Applications/JMP 16.app",
            "/Applications/JMP.app",
        ])
        return candidates
    
    def convert_jsl_paths(self, jsl_content: str, task_dir: Path) -> str:
        """
        Convert hardcoded paths in JSL to use task directory.
        
        Args:
            jsl_content: Original JSL script content
            task_dir: Task directory for output files
            
        Returns:
            Modified JSL content with converted paths
        """
        import re
        
        # Pattern to match Save Picture statements with hardcoded paths
        save_picture_pattern = r'Save Picture\(\s*"([^"]+)"\s*,\s*([^)]+)\s*\)'
        
        def replace_save_picture(match):
            original_path = match.group(1)
            format_param = match.group(2)
            
            # Extract just the filename from the original path
            filename = Path(original_path).name
            
            # Use just the filename (no folder path)
            return f'Save Picture( "{filename}", {format_param} )'
        
        # Only replace Save Picture statements
        converted = re.sub(save_picture_pattern, replace_save_picture, jsl_content)
        
        if converted != jsl_content:
            logger.info(f"Converted Save Picture paths to use simple filenames")
            # Log the conversions
            matches = re.findall(save_picture_pattern, converted)
            for path, format_param in matches:
                logger.debug(f"  Save Picture: {path} ({format_param})")
        
        return converted
    
    def prepend_open_line(self, jsl_file: Path, csv_file: Path, task_dir: Path) -> None:
        """
        Modify JSL file to open CSV and convert paths.
        
        Args:
            jsl_file: Path to JSL file to modify
            csv_file: Path to CSV file to open
            task_dir: Task directory for output files
        """
        header = [
            "//!                               // auto-run flag",
            f'Open("{csv_file.name}");',
            ""
        ]
        original = jsl_file.read_text(encoding="utf-8")
        
        # Convert paths in the JSL content
        converted_content = self.convert_jsl_paths(original, task_dir)
        
        # Log the conversion for debugging
        if original != converted_content:
            print(f"Path conversion applied to {jsl_file.name}:")
            print(f"  Task directory: {task_dir}")
            # Find and show Save Picture statements that were converted
            import re
            save_picture_pattern = r'Save Picture\(\s*"([^"]+)"\s*,\s*([^)]+)\s*\)'
            matches = re.findall(save_picture_pattern, converted_content)
            for path, format_param in matches:
                print(f"  Save Picture: {path} ({format_param})")
        
        jsl_file.write_text("\n".join(header) + converted_content, encoding="utf-8")
        logger.info(f"Modified JSL file to open CSV: {csv_file.name}")
    
    def print_manual_execution_guide(self, task_dir: Path) -> None:
        """
        Print a comprehensive guide for manual execution when automation fails.
        
        Args:
            task_dir: Task directory where results will be saved
        """
        print("\n" + "="*70)
        print("🔧 MANUAL EXECUTION GUIDE")
        print("="*70)
        print("JMP should now be open with your script loaded.")
        print("Since automated execution failed, please run the script manually:")
        print()
        print("📋 STEP-BY-STEP INSTRUCTIONS:")
        print("1. Make sure JMP is the active window")
        print("2. Choose one of these methods to run the script:")
        print()
        print("   ⌨️  Method 1 - Keyboard shortcut:")
        print("      • Press Cmd+R (⌘+R)")
        print()
        print("   📋 Method 2 - Menu:")
        print("      • Go to Run menu → Run Script")
        print()
        print("   🖱️  Method 3 - Right-click:")
        print("      • Right-click in the script window")
        print("      • Select 'Run Script'")
        print()
        print("   🔘 Method 4 - Toolbar:")
        print("      • Click the 'Run Script' button in the toolbar")
        print()
        print("📊 WHAT WILL HAPPEN:")
        print("• The script will automatically open the CSV file")
        print("• It will generate 65 PNG images (FAI4.png, FAI5.png, etc.)")
        print("• Images will be saved to:", task_dir)
        print("• Each image shows a Graph Builder visualization")
        print()
        print("⏱️  EXPECTED TIMING:")
        print("• Script execution: ~30-60 seconds")
        print("• Image generation: ~1-2 seconds per graph")
        print("• Total time: ~2-3 minutes")
        print()
        print("🔍 MONITORING PROGRESS:")
        print("• Watch the task directory for new PNG files")
        print("• JMP will show progress in the status bar")
        print("• Script will close windows automatically after each graph")
        print()
        print("✅ COMPLETION:")
        print("• When finished, you'll have 65 PNG files")
        print("• The script will return to the script window")
        print("• You can close JMP or run additional scripts")
        print()
        print("❓ TROUBLESHOOTING:")
        print("• If script fails: Check JMP log window for errors")
        print("• If images missing: Verify file paths in script")
        print("• If JMP freezes: Force quit and restart")
        print("="*70)
    
    def check_macos_permissions(self) -> None:
        """
        Check and provide guidance on macOS permissions for AppleScript automation.
        """
        print("\n" + "="*70)
        print("🔐 macOS PERMISSIONS GUIDE")
        print("="*70)
        print("If you want to enable automated script execution, you need to grant")
        print("permissions to Terminal/Python for AppleScript automation:")
        print()
        print("📋 STEPS TO ENABLE AUTOMATION:")
        print("1. Open System Preferences → Security & Privacy")
        print("2. Go to the 'Privacy' tab")
        print("3. Select 'Automation' from the left sidebar")
        print("4. Find 'Terminal' (or your Python app) in the list")
        print("5. Check the box next to 'JMP'")
        print("6. Also check 'System Events' if available")
        print()
        print("🔄 ALTERNATIVE METHOD:")
        print("1. Open System Preferences → Security & Privacy")
        print("2. Go to the 'Privacy' tab")
        print("3. Select 'Accessibility' from the left sidebar")
        print("4. Add Terminal (or your Python app) to the list")
        print("5. Make sure it's checked/enabled")
        print()
        print("⚠️  NOTE:")
        print("• You may need to restart Terminal/Python after changing permissions")
        print("• Some organizations restrict these permissions")
        print("• Manual execution always works regardless of permissions")
        print("="*70)
    
    def find_jmp_processes(self) -> List[psutil.Process]:
        """Find all running JMP processes."""
        jmp_processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                if 'jmp' in proc.info['name'].lower():
                    jmp_processes.append(proc)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return jmp_processes
    
    def close_jmp_processes(self) -> None:
        """Close all JMP processes."""
        try:
            jmp_processes = self.find_jmp_processes()
            if not jmp_processes:
                logger.info("No JMP processes found to close")
                return
            
            logger.info(f"Closing {len(jmp_processes)} JMP processes")
            
            for proc in jmp_processes:
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
                    try:
                        proc.kill()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        logger.warning(f"Cannot close JMP process {proc.pid} - access denied")
            
            # Also try AppleScript to close JMP
            if jmp_processes and APPLESCRIPT_AVAILABLE:
                try:
                    subprocess.run([
                        "osascript", "-e", 
                        'tell application "JMP" to quit'
                    ], capture_output=True, timeout=10)
                    logger.info("Closed JMP via AppleScript")
                except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                    logger.warning("AppleScript JMP close failed or timed out")
                    
        except Exception as e:
            logger.error(f"Error closing JMP processes: {e}")
    
    def run_jsl_with_jmp(self, jsl_path: Path, task_dir: Path) -> str:
        """
        Run JSL script with JMP using AppleScript.
        
        Args:
            jsl_path: Path to JSL file
            task_dir: Task directory for monitoring
            
        Returns:
            Status message
        """
        try:
            if not APPLESCRIPT_AVAILABLE:
                return "❌ AppleScript not available - manual execution required"
            
            # Check if script has auto-run flag
            script_content = jsl_path.read_text(encoding="utf-8")
            has_auto_run = "//!" in script_content.split('\n')[0] if script_content else False
            
            logger.info(f"JSL script has auto-run flag: {has_auto_run}")
            
            # Use AppleScript to run the script - try multiple approaches
            osa_scripts = [
                # Method 1: Try Cmd+R approach (most reliable)
                '''
                tell application "System Events"
                    tell application process "JMP"
                        set frontmost to true
                        delay 2
                        try
                            keystroke "r" using {command down}
                            return "Run Script triggered via Cmd+R ✅"
                        on error errMsg
                            return "❌ Cmd+R error: " & errMsg
                        end try
                    end tell
                end tell
                ''',
                # Method 2: Try to run script directly
                f'''
                tell application "JMP"
                    activate
                    delay 3
                    try
                        run script file "{jsl_path}"
                        return "Script executed via run script ✅"
                    on error errMsg
                        return "❌ Run script error: " & errMsg
                    end try
                end tell
                ''',
                # Method 3: Try menu approach
                '''
                tell application "System Events"
                    tell application process "JMP"
                        set frontmost to true
                        delay 2
                        try
                            click menu item "Run Script" of menu "Run" of menu bar 1
                            return "Run Script triggered via menu ✅"
                        on error errMsg
                            return "❌ Menu error: " & errMsg
                        end try
                    end tell
                end tell
                ''',
                # Method 4: Try right-click context menu
                '''
                tell application "System Events"
                    tell application process "JMP"
                        set frontmost to true
                        delay 2
                        try
                            right click
                            delay 1
                            click menu item "Run Script" of menu 1
                            return "Run Script triggered via context menu ✅"
                        on error errMsg
                            return "❌ Context menu error: " & errMsg
                        end try
                    end tell
                end tell
                '''
            ]
            
            result = "No automation method worked"
            automation_success = False
            
            for i, osa in enumerate(osa_scripts):
                try:
                    logger.info(f"Trying AppleScript method {i+1}")
                    script_result = applescript.run(osa)
                    # Convert Result object to string
                    result = str(script_result)
                    logger.info(f"AppleScript method {i+1} result: {result}")
                    # Also try to get the actual value
                    try:
                        result_value = script_result.out
                        logger.info(f"AppleScript method {i+1} actual value: {result_value}")
                        if result_value and "✅" in str(result_value):
                            result = str(result_value)
                            automation_success = True
                            break
                    except:
                        pass
                    if "✅" in result:
                        automation_success = True
                        break
                except Exception as e:
                    logger.warning(f"AppleScript method {i+1} failed: {e}")
                    continue
            
            # If automation failed, provide clear instructions
            if not automation_success:
                logger.warning("All AppleScript automation methods failed")
                logger.info("This is likely due to macOS security restrictions")
                logger.info("Manual execution required - see instructions below")
                
                # Print comprehensive manual execution guide
                self.print_manual_execution_guide(task_dir)
                
                # Also show permissions guide for future reference
                self.check_macos_permissions()
                
                result = "⚠️ Manual execution required - see guides above"
            
            logger.info("Executed JSL script in JMP")
            
            # Wait for JMP to complete processing
            completed, message = self.wait_for_jmp_completion(task_dir)
            
            if completed:
                return f"{result} - {message}"
            else:
                return f"{result} - {message}"
                
        except Exception as e:
            error_msg = f"❌ Error running JMP: {str(e)}"
            logger.error(error_msg)
            return error_msg
    
    def wait_for_jmp_completion(self, task_dir: Path) -> Tuple[bool, str]:
        """
        Wait for JMP to finish by monitoring file count stability and CPU usage.
        
        Args:
            task_dir: Task directory to monitor for output files
            
        Returns:
            Tuple of (completed, message)
        """
        start_time = time.time()
        
        # Wait a bit for JMP to start processing (reduced for faster timeout)
        initial_delay = min(2, self.max_wait_time // 10)  # 2 seconds or 10% of max wait time
        time.sleep(initial_delay)
        
        last_file_count = 0
        stable_count = 0
        # Reduce stable count requirement for faster timeout
        required_stable_count = 2 if self.max_wait_time <= 30 else 3
        
        logger.info(f"Monitoring JMP completion with {self.max_wait_time}s timeout...")
        
        # Use shorter sleep intervals for faster timeout
        sleep_interval = 1 if self.max_wait_time <= 30 else 2
        
        min_runtime = 10  # enforce a short minimum wait before early-exit logic
        while time.time() - start_time < self.max_wait_time:
            # Check CPU usage of JMP processes
            jmp_processes = self.find_jmp_processes()
            cpu_usage = sum(proc.cpu_percent() for proc in jmp_processes)
            
            # Count PNG files (generated images)
            png_files = list(task_dir.glob("*.png"))
            current_count = len(png_files)
            
            # Check if file count changed
            if current_count != last_file_count:
                last_file_count = current_count
                stable_count = 0
                logger.info(f"Found {current_count} images, CPU usage: {cpu_usage:.1f}%")
            else:
                stable_count += 1
            
            # Check if JMP is done (low CPU and stable file count)
            if (time.time() - start_time) >= min_runtime and cpu_usage < 5.0 and stable_count >= required_stable_count:
                logger.info(f"JMP completed successfully. Generated {current_count} images.")
                return True, f"Completed successfully. Generated {current_count} images."
            
            # Early failure detection: if no images after reasonable time and no JMP processes
            elapsed = time.time() - start_time
            if elapsed > min_runtime and current_count == 0 and len(jmp_processes) == 0:
                logger.warning("No JMP processes found and no images generated after 10 seconds")
                return False, "JMP process not running and no images generated"
            
            time.sleep(sleep_interval)
        
        # Timeout
        final_png_files = list(task_dir.glob("*.png"))
        final_count = len(final_png_files)
        timeout_msg = f"Timeout waiting for JMP completion after {self.max_wait_time}s. Found {final_count} images."
        logger.warning(timeout_msg)
        return False, timeout_msg
    
    def generate_failure_image(self, task_dir: Path, error_message: str = None) -> str:
        """
        Generate a 800x600 PNG image with Chinese error message when task fails.
        
        Args:
            task_dir: Task directory to save the failure image
            error_message: Optional custom error message
            
        Returns:
            Path to the generated failure image
        """
        # Default Chinese error message
        if not error_message:
            error_message = "运行失败，请检查脚本和数据问题，请尝试本地运行，查看错误代码。"
        
        # Create 800x600 image with white background
        width, height = 800, 600
        image = Image.new('RGB', (width, height), color='white')
        draw = ImageDraw.Draw(image)
        
        # Try to use a Chinese font, fallback to default if not available
        try:
            # Try common Chinese fonts on macOS
            font_paths = [
                '/System/Library/Fonts/PingFang.ttc',
                '/System/Library/Fonts/STHeiti Light.ttc',
                '/System/Library/Fonts/Helvetica.ttc',
                '/Library/Fonts/Arial Unicode MS.ttf'
            ]
            
            font = None
            for font_path in font_paths:
                if os.path.exists(font_path):
                    try:
                        font = ImageFont.truetype(font_path, 24)
                        break
                    except:
                        continue
            
            if not font:
                font = ImageFont.load_default()
                
        except:
            font = ImageFont.load_default()
        
        # Calculate text position (center)
        text_lines = error_message.split('，')
        line_height = 40
        total_height = len(text_lines) * line_height
        start_y = (height - total_height) // 2
        
        # Draw each line of text
        for i, line in enumerate(text_lines):
            # Get text bounding box
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            text_x = (width - text_width) // 2
            text_y = start_y + i * line_height
            
            # Draw text in red color
            draw.text((text_x, text_y), line, fill='red', font=font)
        
        # Add a border
        draw.rectangle([10, 10, width-10, height-10], outline='red', width=3)
        
        # Save the image
        failure_image_path = task_dir / "failure_error.png"
        image.save(failure_image_path, 'PNG')
        
        logger.info(f"Generated failure image: {failure_image_path}")
        return str(failure_image_path)
    
    def run_csv_jsl(self, 
                   csv_path: Union[str, Path], 
                   jsl_path: Union[str, Path],
                   task_id: Optional[str] = None) -> Dict:
        """
        Run the complete JMP pipeline with CSV and JSL files.
        
        Args:
            csv_path: Path to CSV file
            jsl_path: Path to JSL file
            task_id: Optional task ID (default: timestamp)
            
        Returns:
            Dictionary with results including status, images, and metadata
        """
        # Generate task ID if not provided
        if task_id is None:
            task_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Convert to Path objects
        csv_path = Path(csv_path).expanduser().resolve()
        jsl_path = Path(jsl_path).expanduser().resolve()
        
        # Validate input files
        if not csv_path.exists():
            return {
                "status": "failed",
                "error": f"CSV file not found: {csv_path}",
                "task_id": task_id
            }
        
        if not jsl_path.exists():
            return {
                "status": "failed", 
                "error": f"JSL file not found: {jsl_path}",
                "task_id": task_id
            }
        
        # Create task directory
        task_dir = self.base_task_dir / f"task_{task_id}"
        task_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Starting JMP task {task_id}")
        logger.info(f"CSV: {csv_path.name}")
        logger.info(f"JSL: {jsl_path.name}")
        logger.info(f"Task directory: {task_dir}")
        
        try:
            # Copy input files to task directory
            csv_dst = task_dir / csv_path.name
            jsl_dst = task_dir / jsl_path.name
            
            csv_dst.write_bytes(csv_path.read_bytes())
            jsl_dst.write_bytes(jsl_path.read_bytes())
            
            # Close any existing JMP processes
            self.close_jmp_processes()
            
            # Modify JSL to open CSV and convert paths
            self.prepend_open_line(jsl_dst, csv_dst, task_dir)
            
            # Open JSL file with JMP
            logger.info("Opening JSL file with JMP")
            # Explicitly open with JMP (try multiple known names/paths)
            last_err: Optional[Exception] = None
            opened = False
            for app in self._candidate_jmp_apps():
                try:
                    subprocess.run(["open", "-a", app, str(jsl_dst)], check=True, capture_output=True)
                    logger.info(f"Opened JSL with application: {app}")
                    opened = True
                    break
                except subprocess.CalledProcessError as e:
                    last_err = e
                    logger.warning(f"Failed to open with '{app}': {e}")
                    continue
            if not opened:
                # Fallback: try default opener (may still fail)
                logger.warning("Falling back to default opener for JSL")
                subprocess.run(["open", str(jsl_dst)], check=True)
            time.sleep(self.jmp_start_delay)
            
            
            # Run the JSL script
            logger.info("Running JSL script in JMP")
            run_status = self.run_jsl_with_jmp(jsl_dst, task_dir)
            
            
            # Always close JMP processes
            self.close_jmp_processes()
            
            # Process images with OCR workflow
            processed_images, ocr_results = self._process_images_with_ocr(task_dir)
            
            # Create results dictionary
            result = {
                "status": "completed" if "✅" in run_status and len(processed_images) > 0 else "failed",
                "task_id": task_id,
                "task_dir": str(task_dir),
                "csv_file": csv_path.name,
                "jsl_file": jsl_path.name,
                "run_status": run_status,
                "images": processed_images,
                "image_count": len(processed_images),
                "ocr_results": ocr_results,
                "created_at": datetime.now().isoformat()
            }
            
            # Check for various failure conditions
            if "❌" in run_status or "Timeout" in run_status or len(processed_images) == 0:
                result["status"] = "failed"
                
                # Generate failure image
                failure_image_path = self.generate_failure_image(task_dir)
                processed_images.append(failure_image_path)
                result["images"] = processed_images
                result["image_count"] = len(processed_images)
                
                if "Timeout" in run_status:
                    result["error"] = f"JMP processing timed out after {self.max_wait_time} seconds"
                elif len(processed_images) == 1:  # Only the failure image
                    result["error"] = "No images were generated by JMP"
                else:
                    result["error"] = run_status
            
            logger.info(f"Task {task_id} completed. Generated {len(processed_images)} images.")
            return result
            
        except Exception as e:
            error_msg = f"Error running JMP task: {str(e)}"
            logger.error(error_msg)
            
            # Always try to close JMP processes
            self.close_jmp_processes()
            
            # Generate failure image for exception cases
            try:
                failure_image_path = self.generate_failure_image(task_dir, error_msg)
                images = [failure_image_path]
            except Exception as img_error:
                logger.error(f"Failed to generate failure image: {img_error}")
                images = []
            
            return {
                "status": "failed",
                "error": error_msg,
                "task_id": task_id,
                "task_dir": str(task_dir),
                "csv_file": csv_path.name,
                "jsl_file": jsl_path.name,
                "images": images,
                "image_count": len(images)
            }
    
    def _process_images_with_ocr(self, task_dir: Path) -> Tuple[List[str], Dict]:
        """
        Process images with OCR workflow.
        
        This method handles the special case where initial.png and final.png
        are processed through OCR before being saved to the task directory.
        Other PNG files are handled normally.
        
        Args:
            task_dir: Task directory containing generated images
            
        Returns:
            Tuple of (processed_image_list, ocr_results_dict)
        """
        try:
            # Import OCR processor
            from app.core.ocr_processor import OCRProcessor
            
            ocr_processor = OCRProcessor()
            ocr_results = {}
            processed_images = []
            
            # Find all PNG files in the task directory
            all_png_files = list(task_dir.glob("*.png"))
            logger.info(f"Found {len(all_png_files)} PNG files in task directory")
            
            # Separate initial.png and final.png from other images
            initial_png = None
            final_png = None
            other_images = []
            
            for png_file in all_png_files:
                if png_file.name == "initial.png":
                    initial_png = png_file
                elif png_file.name == "final.png":
                    final_png = png_file
                else:
                    other_images.append(png_file)
            
            # Process initial.png and final.png with OCR
            if initial_png or final_png:
                logger.info("Processing initial.png and final.png with OCR workflow")
                
                # Move initial.png and final.png to temporary names
                if initial_png:
                    temp_initial = task_dir / "initial_temp.png"
                    initial_png.rename(temp_initial)
                    logger.info("Moved initial.png to temporary location for OCR processing")
                
                if final_png:
                    temp_final = task_dir / "final_temp.png"
                    final_png.rename(temp_final)
                    logger.info("Moved final.png to temporary location for OCR processing")
                
                # Process OCR on the temporary files
                ocr_results = ocr_processor.process_initial_final_images(task_dir)
                
                # Save OCR results to task directory
                ocr_results_path = task_dir / "ocr_results.json"
                ocr_processor.save_ocr_results(ocr_results, ocr_results_path)
                
                # Move images back to task directory only if OCR was successful
                ocr_processor.move_images_after_ocr(task_dir, ocr_results)
                
                # Add processed images to the list
                if ocr_results.get("initial", {}).get("success", False):
                    processed_images.append("initial.png")
                
                if ocr_results.get("final", {}).get("success", False):
                    processed_images.append("final.png")
                
                logger.info(f"OCR processing completed. Initial: {ocr_results.get('initial', {}).get('success', False)}, Final: {ocr_results.get('final', {}).get('success', False)}")
            
            # Add other images to the processed list (these don't need OCR)
            for img_file in other_images:
                processed_images.append(img_file.name)
            
            # Sort the final list
            processed_images.sort()
            
            logger.info(f"Total processed images: {len(processed_images)}")
            return processed_images, ocr_results
            
        except ImportError:
            logger.warning("OCR processor not available - processing images normally")
            # Fallback to normal processing if OCR is not available
            png_files = sorted([p.name for p in task_dir.glob("*.png")])
            return png_files, {}
            
        except Exception as e:
            logger.error(f"Error in OCR image processing: {e}")
            # Fallback to normal processing on error
            png_files = sorted([p.name for p in task_dir.glob("*.png")])
            return png_files, {"error": str(e)}
    
    def create_results_zip(self, task_dir: Path, task_id: str) -> Optional[Path]:
        """
        Create a ZIP file with all results from a task.
        
        Args:
            task_dir: Task directory containing results
            task_id: Task ID for naming the ZIP file
            
        Returns:
            Path to created ZIP file or None if failed
        """
        try:
            zip_path = task_dir / f"results_{task_id}.zip"
            
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for file_path in task_dir.iterdir():
                    if file_path.is_file() and not file_path.is_symlink():
                        # Include certain file types
                        if file_path.suffix.lower() in {'.csv', '.jsl', '.png', '.txt'}:
                            zf.write(file_path, file_path.name)
            
            logger.info(f"Created results ZIP: {zip_path}")
            return zip_path
            
        except Exception as e:
            logger.error(f"Error creating ZIP file: {e}")
            return None


def main():
    """
    Example usage of the JMPRunner module.
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Run JMP with CSV and JSL files")
    parser.add_argument("csv", help="Path to CSV file")
    parser.add_argument("jsl", help="Path to JSL file")
    parser.add_argument("--task-dir", help="Task directory (default: ./tasks)")
    parser.add_argument("--max-wait", type=int, default=300, help="Max wait time in seconds")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create JMP runner
    runner = JMPRunner(
        base_task_dir=args.task_dir,
        max_wait_time=args.max_wait
    )
    
    # Run the task
    result = runner.run_csv_jsl(args.csv, args.jsl)
    
    # Print results
    print(f"\nTask Status: {result['status']}")
    print(f"Task ID: {result['task_id']}")
    print(f"Images Generated: {result['image_count']}")
    
    if result['images']:
        print("Generated Images:")
        for img in result['images']:
            print(f"  - {img}")
    
    if result['status'] == 'failed':
        print(f"Error: {result.get('error', 'Unknown error')}")
    
    # Create ZIP file
    if result['status'] == 'completed':
        zip_path = runner.create_results_zip(Path(result['task_dir']), result['task_id'])
        if zip_path:
            print(f"Results ZIP: {zip_path}")


if __name__ == "__main__":
    main()
