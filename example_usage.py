#!/usr/bin/env python3
"""
Example Usage of JMP Runner Module
=================================

This script demonstrates how to use the jmp_runner module to process
CSV and JSL files with JMP to generate images.

Prerequisites:
- JMP software installed on macOS
- CSV file with data
- JSL file with visualization script
- Optional: pip install applescript Pillow pytesseract for full functionality

Example JSL script should contain Save Picture() statements like:
    Save Picture( "/path/to/output.png", PNG );
"""

import os
import sys
from pathlib import Path
from jmp_runner import JMPRunner


def create_sample_data():
    """Create sample CSV data for testing."""
    csv_content = """Name,Age,Salary,Department
John Doe,30,75000,Engineering
Jane Smith,28,68000,Marketing
Bob Johnson,35,82000,Engineering
Alice Brown,32,71000,Sales
Charlie Wilson,29,65000,Marketing
Diana Davis,31,78000,Engineering
Eve Miller,27,62000,Sales
Frank Garcia,33,85000,Engineering
Grace Lee,30,73000,Marketing
Henry Taylor,34,79000,Sales"""
    
    csv_path = Path("sample_data.csv")
    csv_path.write_text(csv_content)
    print(f"Created sample CSV: {csv_path}")
    return csv_path


def create_sample_jsl():
    """Create sample JSL script for testing."""
    jsl_content = '''// Sample JSL script to create visualizations
// This script will be modified by JMPRunner to open the CSV file

// Create a distribution plot
Distribution(
    Y( :Age ),
    Horizontal Layout( 1 ),
    Vertical( 0 )
);

// Save the plot
Save Picture( "age_distribution.png", PNG );

// Create a scatter plot
Scatter Plot(
    Y( :Salary ),
    X( :Age ),
    Fit Line( 1 )
);

// Save the scatter plot
Save Picture( "salary_vs_age.png", PNG );

// Create a bar chart by department
Chart(
    Y( :Salary ),
    X( :Department ),
    Bar Chart( 1 )
);

// Save the bar chart
Save Picture( "salary_by_department.png", PNG );'''
    
    jsl_path = Path("sample_script.jsl")
    jsl_path.write_text(jsl_content)
    print(f"Created sample JSL: {jsl_path}")
    return jsl_path


def example_basic_usage():
    """Basic usage example."""
    print("\n=== Basic Usage Example ===")
    
    # Create sample files
    csv_path = create_sample_data()
    jsl_path = create_sample_jsl()
    
    try:
        # Create JMP runner instance
        runner = JMPRunner(
            base_task_dir="./example_tasks",
            max_wait_time=120,  # 2 minutes
            capture_screenshots=False,
            safe_mode=False
        )
        
        # Run the task
        print("Running JMP with CSV and JSL files...")
        result = runner.run_csv_jsl(csv_path, jsl_path)
        
        # Display results
        print(f"\nTask Status: {result['status']}")
        print(f"Task ID: {result['task_id']}")
        print(f"Images Generated: {result['image_count']}")
        
        if result['images']:
            print("\nGenerated Images:")
            for img in result['images']:
                print(f"  - {img}")
        
        if result['status'] == 'completed':
            print(f"\nTask completed successfully!")
            print(f"Results stored in: {result['task_dir']}")
            
            # Create ZIP file with results
            zip_path = runner.create_results_zip(Path(result['task_dir']), result['task_id'])
            if zip_path:
                print(f"Results ZIP created: {zip_path}")
        else:
            print(f"\nTask failed: {result.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"Error: {e}")
    
    finally:
        # Clean up sample files
        csv_path.unlink(missing_ok=True)
        jsl_path.unlink(missing_ok=True)


def example_advanced_usage():
    """Advanced usage example with screenshots and safe mode."""
    print("\n=== Advanced Usage Example ===")
    
    # Create sample files
    csv_path = create_sample_data()
    jsl_path = create_sample_jsl()
    
    try:
        # Create JMP runner with advanced features
        runner = JMPRunner(
            base_task_dir="./advanced_tasks",
            max_wait_time=180,  # 3 minutes
            capture_screenshots=True,  # Capture JMP window screenshots
            safe_mode=True  # Enable OCR processing of screenshots
        )
        
        # Run the task
        print("Running JMP with advanced features...")
        result = runner.run_csv_jsl(
            csv_path, 
            jsl_path,
            task_id="advanced_example",  # Custom task ID
            capture_initial=True,  # Capture initial screenshots
            capture_final=True     # Capture final screenshots
        )
        
        # Display detailed results
        print(f"\nTask Status: {result['status']}")
        print(f"Task ID: {result['task_id']}")
        print(f"Images Generated: {result['image_count']}")
        print(f"Run Status: {result['run_status']}")
        
        if result['images']:
            print("\nGenerated Images:")
            for img in result['images']:
                print(f"  - {img}")
        
        if result['initial_screenshots']:
            print(f"\nInitial Screenshots: {len(result['initial_screenshots'])}")
            for screenshot in result['initial_screenshots']:
                print(f"  - {Path(screenshot).name}")
        
        if result['final_screenshots']:
            print(f"\nFinal Screenshots: {len(result['final_screenshots'])}")
            for screenshot in result['final_screenshots']:
                print(f"  - {Path(screenshot).name}")
        
        if result['status'] == 'completed':
            print(f"\nAdvanced task completed successfully!")
            print(f"Results stored in: {result['task_dir']}")
            
            # Create ZIP file with results
            zip_path = runner.create_results_zip(Path(result['task_dir']), result['task_id'])
            if zip_path:
                print(f"Results ZIP created: {zip_path}")
        else:
            print(f"\nTask failed: {result.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"Error: {e}")
    
    finally:
        # Clean up sample files
        csv_path.unlink(missing_ok=True)
        jsl_path.unlink(missing_ok=True)


def example_batch_processing():
    """Example of processing multiple CSV/JSL pairs."""
    print("\n=== Batch Processing Example ===")
    
    # Create multiple sample files
    datasets = [
        ("sales_data.csv", "sales_analysis.jsl"),
        ("employee_data.csv", "employee_charts.jsl"),
        ("product_data.csv", "product_visualization.jsl")
    ]
    
    # Create sample data for each dataset
    sample_data = """Product,Sales,Region
Widget A,1500,North
Widget B,2200,South
Widget C,1800,East
Widget D,1900,West
Widget E,2100,North"""
    
    sample_jsl = '''// Simple bar chart
Chart(
    Y( :Sales ),
    X( :Product ),
    Bar Chart( 1 )
);

Save Picture( "product_sales.png", PNG );'''
    
    try:
        runner = JMPRunner(base_task_dir="./batch_tasks")
        
        results = []
        for csv_name, jsl_name in datasets:
            # Create files
            csv_path = Path(csv_name)
            jsl_path = Path(jsl_name)
            
            csv_path.write_text(sample_data)
            jsl_path.write_text(sample_jsl)
            
            print(f"\nProcessing {csv_name} with {jsl_name}...")
            
            # Run task
            result = runner.run_csv_jsl(csv_path, jsl_path)
            results.append(result)
            
            print(f"  Status: {result['status']}")
            print(f"  Images: {result['image_count']}")
            
            # Clean up files
            csv_path.unlink(missing_ok=True)
            jsl_path.unlink(missing_ok=True)
        
        # Summary
        print(f"\nBatch Processing Summary:")
        print(f"Total tasks: {len(results)}")
        print(f"Successful: {sum(1 for r in results if r['status'] == 'completed')}")
        print(f"Failed: {sum(1 for r in results if r['status'] == 'failed')}")
        print(f"Total images generated: {sum(r['image_count'] for r in results)}")
        
    except Exception as e:
        print(f"Error in batch processing: {e}")


def example_error_handling():
    """Example of error handling."""
    print("\n=== Error Handling Example ===")
    
    try:
        runner = JMPRunner()
        
        # Try to run with non-existent files
        print("Testing with non-existent files...")
        result = runner.run_csv_jsl("nonexistent.csv", "nonexistent.jsl")
        
        print(f"Status: {result['status']}")
        print(f"Error: {result.get('error', 'No error message')}")
        
        # Try with invalid JSL file
        print("\nTesting with invalid JSL file...")
        csv_path = create_sample_data()
        invalid_jsl_path = Path("invalid.jsl")
        invalid_jsl_path.write_text("// Invalid JSL content\nInvalidCommand();")
        
        result = runner.run_csv_jsl(csv_path, invalid_jsl_path)
        
        print(f"Status: {result['status']}")
        print(f"Error: {result.get('error', 'No error message')}")
        
        # Clean up
        csv_path.unlink(missing_ok=True)
        invalid_jsl_path.unlink(missing_ok=True)
        
    except Exception as e:
        print(f"Error in error handling example: {e}")


def main():
    """Run all examples."""
    print("JMP Runner Module - Example Usage")
    print("=" * 50)
    
    # Check if JMP is available
    try:
        from jmp_runner import APPLESCRIPT_AVAILABLE
        if not APPLESCRIPT_AVAILABLE:
            print("Warning: AppleScript not available. JMP automation may not work.")
            print("Install with: pip install applescript")
    except ImportError:
        print("Error: jmp_runner module not found. Make sure it's in the same directory.")
        return
    
    # Run examples
    try:
        example_basic_usage()
        example_advanced_usage()
        example_batch_processing()
        example_error_handling()
        
        print("\n" + "=" * 50)
        print("All examples completed!")
        
    except KeyboardInterrupt:
        print("\nExamples interrupted by user.")
    except Exception as e:
        print(f"\nUnexpected error: {e}")


if __name__ == "__main__":
    main()
