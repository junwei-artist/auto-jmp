"""
Utility functions for creating ZIP files with Excel, CSV, and JSL content
"""
import zipfile
import tempfile
import os
import logging
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

class ZipFileGenerator:
    """Utility class for generating ZIP files with analysis results"""
    
    @staticmethod
    def create_analysis_zip(
        excel_content: bytes,
        excel_filename: str,
        csv_content: str,
        jsl_content: str,
        analysis_type: str,
        output_dir: str = "/tmp"
    ) -> Dict[str, Any]:
        """
        Create a ZIP file containing original Excel, CSV, and JSL files
        
        Args:
            excel_content: Original Excel file content as bytes
            excel_filename: Original Excel filename
            csv_content: Generated CSV content as string
            jsl_content: Generated JSL content as string
            analysis_type: Type of analysis (e.g., "boxplot", "cpk", "commonality")
            output_dir: Output directory for ZIP file
            
        Returns:
            Dict with ZIP file path and metadata
        """
        try:
            # Create temporary ZIP file
            zip_fd, zip_path = tempfile.mkstemp(suffix='.zip', dir=output_dir)
            os.close(zip_fd)
            
            # Generate README content based on analysis type
            readme_content = ZipFileGenerator._generate_readme(analysis_type, excel_filename)
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add original Excel file
                zipf.writestr(excel_filename, excel_content)
                
                # Add generated CSV file
                zipf.writestr("data.csv", csv_content)
                
                # Add generated JSL file
                zipf.writestr("script.jsl", jsl_content)
                
                # Add README file
                zipf.writestr("README.txt", readme_content)
            
            # Get file size
            zip_size = os.path.getsize(zip_path)
            
            logger.info(f"Created analysis ZIP file: {zip_path} ({zip_size} bytes)")
            
            return {
                "success": True,
                "zip_path": zip_path,
                "zip_size": zip_size,
                "zip_size_mb": round(zip_size / (1024 * 1024), 2)
            }
            
        except Exception as e:
            logger.error(f"Error creating ZIP file: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def _generate_readme(analysis_type: str, excel_filename: str) -> str:
        """Generate README content based on analysis type"""
        
        base_readme = f"""# Analysis Files - {excel_filename}

This ZIP contains the generated files for your Excel analysis:

- `{excel_filename}`: Original Excel file
- `data.csv`: Processed data suitable for JMP analysis
- `script.jsl`: JMP script for generating analysis charts

## Usage

1. Open JMP
2. Open the `data.csv` file
3. Run the `script.jsl` file to generate analysis charts

## Data Format

The CSV file contains processed data optimized for JMP analysis.
The JSL script will generate appropriate charts based on your data structure.

## Analysis Type: {analysis_type.title()}

"""
        
        if analysis_type.lower() == "boxplot":
            analysis_specific = """### Boxplot Analysis
- Generates boxplot charts for each main level in your data
- Shows distribution of FAI measurements
- Includes reference lines (USL, LSL, Target) if available
"""
        elif analysis_type.lower() == "cpk":
            analysis_specific = """### Process Capability (CPK) Analysis
- Generates process capability analysis charts
- Calculates CPK values and process performance metrics
- Shows specification limits and process distribution
"""
        elif analysis_type.lower() == "commonality":
            analysis_specific = """### Commonality Analysis
- Generates commonality analysis charts
- Analyzes measurement consistency across different conditions
- Shows FAI measurement patterns and variations
"""
        else:
            analysis_specific = f"""### {analysis_type.title()} Analysis
- Custom analysis based on your data structure
- Optimized for JMP processing and visualization
"""
        
        return base_readme + analysis_specific
