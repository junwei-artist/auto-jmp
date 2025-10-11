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
- Optional screenshot capture
- Safe mode with OCR processing

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

# Optional imports for advanced features
try:
    import applescript
    APPLESCRIPT_AVAILABLE = True
except ImportError:
    APPLESCRIPT_AVAILABLE = False
    print("Warning: applescript not available. Install with: pip install applescript")

try:
    from PIL import Image, ImageDraw, ImageFont
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print("Warning: OCR features not available. Install with: pip install Pillow pytesseract")

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
                 jmp_start_delay: int = 4,
                 safe_mode: bool = False,
                 capture_screenshots: bool = False):
        """
        Initialize JMP Runner.
        
        Args:
            base_task_dir: Directory to store task files (default: ./tasks)
            max_wait_time: Maximum time to wait for JMP completion (seconds)
            jmp_start_delay: Delay after opening JMP before running script (seconds)
            safe_mode: Enable OCR processing of screenshots (requires OCR_AVAILABLE)
            capture_screenshots: Capture JMP window screenshots
        """
        self.base_task_dir = Path(base_task_dir) if base_task_dir else Path("./tasks")
        self.max_wait_time = max_wait_time
        self.jmp_start_delay = jmp_start_delay
        self.safe_mode = safe_mode and OCR_AVAILABLE
        self.capture_screenshots = capture_screenshots
        
        # Create base task directory if it doesn't exist
        self.base_task_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"JMPRunner initialized with task directory: {self.base_task_dir}")
        if self.safe_mode:
            logger.info("Safe mode enabled - screenshots will be processed with OCR")
        if not APPLESCRIPT_AVAILABLE:
            logger.warning("AppleScript not available - JMP automation may not work properly")
    
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
            
            # Create new path in task directory
            new_path = str(task_dir / filename)
            
            return f'Save Picture( "{new_path}", {format_param} )'
        
        # Only replace Save Picture statements
        converted = re.sub(save_picture_pattern, replace_save_picture, jsl_content)
        
        if converted != jsl_content:
            logger.info(f"Converted Save Picture paths to use task directory: {task_dir}")
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
            f'Open("{csv_file}");',
            ""
        ]
        
        original = jsl_file.read_text(encoding="utf-8")
        converted_content = self.convert_jsl_paths(original, task_dir)
        
        jsl_file.write_text("\n".join(header) + converted_content, encoding="utf-8")
        logger.info(f"Modified JSL file to open CSV: {csv_file.name}")
    
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
                return "❌ AppleScript not available - cannot run JSL script"
            
            # Use AppleScript to run the script - try multiple approaches
            osa_scripts = [
                # Method 1: Try to run script directly
                f'''
                tell application "JMP"
                    activate
                    delay 2
                    try
                        run script file "{jsl_path}"
                        return "Script executed via run script ✅"
                    on error errMsg
                        return "❌ Run script error: " & errMsg
                    end try
                end tell
                ''',
                # Method 2: Try Cmd+R approach
                '''
                tell application "System Events"
                    tell application process "JMP"
                        set frontmost to true
                        delay 1
                        try
                            keystroke "r" using {command down}
                            return "Run Script triggered via Cmd+R ✅"
                        on error errMsg
                            return "❌ Cmd+R error: " & errMsg
                        end try
                    end tell
                end tell
                ''',
                # Method 3: Try menu approach
                '''
                tell application "System Events"
                    tell application process "JMP"
                        set frontmost to true
                        delay 1
                        try
                            click menu item "Run Script" of menu "Run" of menu bar 1
                            return "Run Script triggered via menu ✅"
                        on error errMsg
                            return "❌ Menu error: " & errMsg
                        end try
                    end tell
                end tell
                '''
            ]
            
            result = "No method worked"
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
                            break
                    except:
                        pass
                    if "✅" in result:
                        break
                except Exception as e:
                    logger.warning(f"AppleScript method {i+1} failed: {e}")
                    continue
            
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
        
        # Wait a bit for JMP to start processing
        time.sleep(5)
        
        last_file_count = 0
        stable_count = 0
        required_stable_count = 3  # Number of consecutive stable counts needed
        
        logger.info("Monitoring JMP completion...")
        
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
            if cpu_usage < 5.0 and stable_count >= required_stable_count:
                logger.info(f"JMP completed successfully. Generated {current_count} images.")
                return True, f"Completed successfully. Generated {current_count} images."
            
            time.sleep(2)
        
        # Timeout
        final_png_files = list(task_dir.glob("*.png"))
        final_count = len(final_png_files)
        timeout_msg = f"Timeout waiting for JMP completion. Found {final_count} images."
        logger.warning(timeout_msg)
        return False, timeout_msg
    
    def capture_screenshot(self, task_dir: Path, screenshot_type: str) -> Optional[str]:
        """
        Capture screenshot of JMP windows.
        
        Args:
            task_dir: Task directory to save screenshot
            screenshot_type: Type of screenshot (e.g., 'initial', 'final')
            
        Returns:
            Path to saved screenshot or None if failed
        """
        try:
            # Use screencapture to capture JMP windows
            screenshot_path = task_dir / f"{screenshot_type}_screenshot.png"
            
            # Try to capture JMP windows specifically
            subprocess.run(["screencapture", "-w", str(screenshot_path)], check=True)
            
            if screenshot_path.exists():
                logger.info(f"Captured {screenshot_type} screenshot: {screenshot_path.name}")
                
                # Process in safe mode if enabled
                if self.safe_mode and OCR_AVAILABLE:
                    self.process_screenshot_safe_mode(screenshot_path)
                
                return str(screenshot_path)
            
        except subprocess.CalledProcessError:
            logger.warning(f"Failed to capture {screenshot_type} screenshot")
        except Exception as e:
            logger.error(f"Error capturing screenshot: {e}")
        
        return None
    
    def process_screenshot_safe_mode(self, image_path: Path) -> None:
        """
        Process screenshot in safe mode: extract text and replace with blank image.
        
        Args:
            image_path: Path to screenshot image
        """
        try:
            # Open original image to get dimensions
            with Image.open(image_path) as original_img:
                original_size = original_img.size
                
                # Extract text using OCR
                extracted_text = self.extract_text_from_image(str(image_path))
                logger.info(f"Extracted {len(extracted_text)} characters from screenshot")
                
                # Create blank image with text overlay
                safe_image = self.create_blank_image_with_text(extracted_text, original_size, "JMP Window")
                
                # Save the safe image, overwriting the original
                safe_image.save(image_path, 'PNG')
                logger.info("Replaced screenshot with OCR-safe version")
                
        except Exception as e:
            logger.error(f"Error processing screenshot in safe mode: {e}")
    
    def extract_text_from_image(self, image_path: str) -> str:
        """Extract text from image using OCR."""
        try:
            custom_config = r'--oem 3 --psm 6'
            text = pytesseract.image_to_string(Image.open(image_path), config=custom_config)
            return text.strip()
        except Exception as e:
            logger.error(f"Error extracting text from image {image_path}: {e}")
            return "OCR processing failed"
    
    def create_blank_image_with_text(self, text: str, original_size: Tuple[int, int], window_name: str) -> Image.Image:
        """Create a blank image with OCR text overlay."""
        try:
            # Create a white background image
            img = Image.new('RGB', original_size, color='white')
            draw = ImageDraw.Draw(img)
            
            # Try to use a system font
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 16)
            except:
                try:
                    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
                except:
                    font = ImageFont.load_default()
            
            # Add title
            title = f"Safe Mode Screenshot - {window_name}"
            draw.text((10, 10), title, fill='black', font=font)
            
            # Add OCR text content
            if text and text.strip():
                y_offset = 40
                words = text.split()
                current_line = ""
                
                for word in words:
                    test_line = current_line + " " + word if current_line else word
                    bbox = draw.textbbox((0, 0), test_line, font=font)
                    text_width = bbox[2] - bbox[0]
                    
                    if text_width > original_size[0] - 20:
                        if current_line:
                            draw.text((10, y_offset), current_line, fill='black', font=font)
                            y_offset += 20
                            current_line = word
                        else:
                            draw.text((10, y_offset), word, fill='black', font=font)
                            y_offset += 20
                    else:
                        current_line = test_line
                
                if current_line:
                    draw.text((10, y_offset), current_line, fill='black', font=font)
            
            return img
            
        except Exception as e:
            logger.error(f"Error creating blank image with text: {e}")
            # Return a simple white image with error message
            img = Image.new('RGB', original_size, color='white')
            draw = ImageDraw.Draw(img)
            draw.text((10, 10), f"Error processing screenshot: {str(e)}", fill='red')
            return img
    
    def run_csv_jsl(self, 
                   csv_path: Union[str, Path], 
                   jsl_path: Union[str, Path],
                   task_id: Optional[str] = None,
                   capture_initial: bool = False,
                   capture_final: bool = False) -> Dict:
        """
        Run the complete JMP pipeline with CSV and JSL files.
        
        Args:
            csv_path: Path to CSV file
            jsl_path: Path to JSL file
            task_id: Optional task ID (default: timestamp)
            capture_initial: Capture initial screenshots
            capture_final: Capture final screenshots
            
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
            subprocess.run(["open", str(jsl_dst)], check=True)
            time.sleep(self.jmp_start_delay)
            
            # Capture initial screenshots if requested
            initial_screenshots = []
            if capture_initial or self.capture_screenshots:
                screenshot = self.capture_screenshot(task_dir, "initial")
                if screenshot:
                    initial_screenshots.append(screenshot)
            
            # Run the JSL script
            logger.info("Running JSL script in JMP")
            run_status = self.run_jsl_with_jmp(jsl_dst, task_dir)
            
            # Capture final screenshots if requested
            final_screenshots = []
            if capture_final or self.capture_screenshots:
                screenshot = self.capture_screenshot(task_dir, "final")
                if screenshot:
                    final_screenshots.append(screenshot)
            
            # Always close JMP processes
            self.close_jmp_processes()
            
            # Collect generated images
            png_files = sorted([p.name for p in task_dir.glob("*.png")])
            
            # Create results dictionary
            result = {
                "status": "completed" if "✅" in run_status else "failed",
                "task_id": task_id,
                "task_dir": str(task_dir),
                "csv_file": csv_path.name,
                "jsl_file": jsl_path.name,
                "run_status": run_status,
                "images": png_files,
                "image_count": len(png_files),
                "initial_screenshots": initial_screenshots,
                "final_screenshots": final_screenshots,
                "created_at": datetime.now().isoformat()
            }
            
            if "❌" in run_status:
                result["error"] = run_status
            
            logger.info(f"Task {task_id} completed. Generated {len(png_files)} images.")
            return result
            
        except Exception as e:
            error_msg = f"Error running JMP task: {str(e)}"
            logger.error(error_msg)
            
            # Always try to close JMP processes
            self.close_jmp_processes()
            
            return {
                "status": "failed",
                "error": error_msg,
                "task_id": task_id,
                "task_dir": str(task_dir),
                "csv_file": csv_path.name,
                "jsl_file": jsl_path.name
            }
    
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
    parser.add_argument("--screenshots", action="store_true", help="Capture screenshots")
    parser.add_argument("--safe-mode", action="store_true", help="Enable safe mode with OCR")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create JMP runner
    runner = JMPRunner(
        base_task_dir=args.task_dir,
        max_wait_time=args.max_wait,
        capture_screenshots=args.screenshots,
        safe_mode=args.safe_mode
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
