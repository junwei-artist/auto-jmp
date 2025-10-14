#!/usr/bin/env python3
"""
Excel File Fixer
Fixes corrupted xWindow/yWindow attributes in Excel files
"""

import zipfile
import xml.etree.ElementTree as ET
import shutil
import sys
from pathlib import Path

def fix_excel_file(input_file: str, output_file: str = None) -> bool:
    """
    Fix corrupted xWindow/yWindow attributes in Excel file
    
    Args:
        input_file: Path to the corrupted Excel file
        output_file: Path for the fixed file (defaults to input_file_fixed.xlsx)
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        input_path = Path(input_file)
        if not input_path.exists():
            print(f"Error: File {input_file} does not exist")
            return False
        
        if output_file is None:
            output_file = str(input_path.parent / f"{input_path.stem}_fixed{input_path.suffix}")
        
        print(f"Fixing Excel file: {input_file}")
        print(f"Output file: {output_file}")
        
        # Read the corrupted file
        with zipfile.ZipFile(input_file, 'r') as zip_file:
            # Read workbook.xml
            workbook_xml = zip_file.read('xl/workbook.xml').decode('utf-8')
            
            # Fix the corrupted xWindow and yWindow attributes
            original_xml = workbook_xml
            workbook_xml = workbook_xml.replace('xWindow=""', 'xWindow="0"')
            workbook_xml = workbook_xml.replace('yWindow=""', 'yWindow="0"')
            
            if workbook_xml == original_xml:
                print("No corrupted window attributes found. File may not need fixing.")
                return False
            
            print("Found and fixed corrupted window attributes")
            
            # Create the fixed file
            with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as new_zip:
                # Copy all files except workbook.xml
                for name in zip_file.namelist():
                    if name != 'xl/workbook.xml':
                        new_zip.writestr(name, zip_file.read(name))
                
                # Write the corrected workbook.xml
                new_zip.writestr('xl/workbook.xml', workbook_xml.encode('utf-8'))
        
        print(f"Successfully created fixed file: {output_file}")
        return True
        
    except Exception as e:
        print(f"Error fixing file: {e}")
        return False

def test_fixed_file(file_path: str) -> bool:
    """Test if the fixed file can be read by pandas"""
    try:
        import pandas as pd
        excel_file = pd.ExcelFile(file_path)
        sheets = excel_file.sheet_names
        print(f"✓ Fixed file can be read successfully")
        print(f"  Sheet names: {sheets}")
        return True
    except Exception as e:
        print(f"✗ Fixed file still has issues: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fix_excel_file.py <input_file> [output_file]")
        print("Example: python fix_excel_file.py converted_2025-09-30_15-10-58.xlsx")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    success = fix_excel_file(input_file, output_file)
    
    if success:
        output_path = output_file or str(Path(input_file).parent / f"{Path(input_file).stem}_fixed{Path(input_file).suffix}")
        test_fixed_file(output_path)
    else:
        sys.exit(1)
