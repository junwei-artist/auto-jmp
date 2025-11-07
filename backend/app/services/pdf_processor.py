"""
PDF processing service for FAI detection and annotation extraction.
Based on pdf_gui.py logic.
"""
import os
import re
import json
import shutil
import fitz  # PyMuPDF
from datetime import datetime
from PIL import Image, ImageDraw
from typing import List, Dict, Any, Tuple
from pathlib import Path

Image.MAX_IMAGE_PIXELS = None  # Avoid decompression bomb error


def is_fai_label(text: str) -> bool:
    """Check if a text string contains 'FAI' (or 'FA1', common OCR confusion)."""
    text = text.upper().replace(" ", "")
    return "FAI" in text or "FA1" in text


def find_fai_pairs(blocks: List[Tuple[float, float, float, float, str]]) -> List[Tuple[float, float, float, float, str]]:
    """Find pairs of text blocks — one containing 'FAI' and an associated number.
    Improvements:
    - Detect inline numbers within the same block as FAI (e.g., "FAI 12", "FAI-12", "F.A.I: 12")
    - Allow numbers to the right on the same row (small vertical delta)
    - Keep vertical-below matching with relaxed distance
    """
    fai_pairs: List[Tuple[float, float, float, float, str]] = []
    matched_indices = set()

    # Pre-compile regexes
    inline_re = re.compile(r"\bF\.?A\.?I\b[^0-9]{0,5}(\d{1,5})\b", re.IGNORECASE)
    # Allow optional leading symbols/whitespace before a pure number, e.g., "+ # : -  12"
    pure_num_re = re.compile(r"^[\s#:\-]*?(\d{1,5})$")

    for i, block in enumerate(blocks):
        if i in matched_indices:
            continue

        x0, y0, x1, y1, text = block
        raw_text = text.strip()
        if not raw_text:
            continue

        if is_fai_label(raw_text):
            # 1) Inline match inside the same block
            m = inline_re.search(raw_text)
            if m:
                number = m.group(1)
                label = f"FAI {number}"
                fai_pairs.append((x0, y0, x1, y1, label))
                matched_indices.add(i)
                continue

            # 2) Otherwise, search other blocks for numeric partner
            best_match = None
            best_match_idx = None
            min_metric = float('inf')

            for j, other in enumerate(blocks):
                if i == j or j in matched_indices:
                    continue

                tx0, ty0, tx1, ty1, ttext = other
                ttext_clean = ttext.strip()
                if not ttext_clean:
                    continue

                num_m = pure_num_re.match(ttext_clean)
                if not num_m:
                    continue

                # Case A: numeric block below the FAI block (vertical pairing)
                if (abs(tx0 - x0) < 60 and 0 < (ty0 - y1) < 60):
                    distance = ty0 - y1
                    metric = distance
                    if metric < min_metric:
                        min_metric = metric
                        best_match = other
                        best_match_idx = j
                    continue

                # Case B: numeric block to the right on same row (horizontal pairing)
                y_center_fai = (y0 + y1) / 2.0
                y_center_num = (ty0 + ty1) / 2.0
                if (abs(y_center_num - y_center_fai) < 40 and tx0 >= x1 and (tx0 - x1) < 200):
                    gap = abs(y_center_num - y_center_fai) + (tx0 - x1) * 0.1
                    metric = gap
                    if metric < min_metric:
                        min_metric = metric
                        best_match = other
                        best_match_idx = j

            if best_match is not None and best_match_idx is not None:
                tx0, ty0, tx1, ty1, ttext = best_match
                # Use combined bounding box
                cx0 = min(x0, tx0)
                cy0 = min(y0, ty0)
                cx1 = max(x1, tx1)
                cy1 = max(y1, ty1)
                number = pure_num_re.match(ttext.strip()).group(1)
                label = f"FAI {number}"
                fai_pairs.append((cx0, cy0, cx1, cy1, label))
                matched_indices.add(i)
                matched_indices.add(best_match_idx)

    return fai_pairs


def extract_number(label: str) -> int:
    """Extract number from label for sorting."""
    match = re.search(r'\b(\d+)\b', label)
    return int(match.group(1)) if match else float('inf')


def process_pdf(
    pdf_content: bytes,
    pdf_filename: str,
    output_folder: Path,
    folder_id: str,
    progress_cb: Any = None
) -> Dict[str, Any]:
    """
    Process a PDF file to extract FAI annotations and generate images.
    
    Args:
        pdf_content: PDF file content as bytes
        pdf_filename: Original PDF filename
        output_folder: Base folder path for the drawing folder
        folder_id: Drawing folder ID
        
    Returns:
        Dictionary with annotations and processing results
    """
    # Create folder structure
    folder_path = Path(output_folder) / folder_id
    original_image_folder = folder_path / "original_image"
    original_image_folder.mkdir(parents=True, exist_ok=True)
    
    # Save PDF temporarily - sanitize filename to avoid path issues
    safe_filename = "".join(c for c in pdf_filename if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
    temp_pdf_path = folder_path / safe_filename
    print(f"Saving PDF to: {temp_pdf_path}")
    try:
        with open(str(temp_pdf_path), 'wb') as f:
            f.write(pdf_content)
        print(f"PDF saved successfully. File size: {temp_pdf_path.stat().st_size} bytes")
    except Exception as e:
        print(f"ERROR saving PDF file: {e}")
        raise
    
    # Get base name from PDF filename, ensuring it's sanitized
    base_name = Path(pdf_filename).stem
    # Remove any characters that might cause issues in filenames
    base_name = re.sub(r'[^\w\-_]', '_', base_name)
    print(f"Base name for files: {base_name}")
    class_map = {}
    class_counter = 0
    image_annotations = []
    all_annotations = []
    per_page_counts: Dict[int, int] = {}
    
    # Open PDF and get page count
    print(f"Opening PDF file: {temp_pdf_path}")
    print(f"File exists: {temp_pdf_path.exists()}")
    
    try:
        doc = fitz.open(str(temp_pdf_path))
        total_pages = len(doc)
        print(f"PDF opened successfully. Has {total_pages} pages - will process pages 1 through {total_pages}")
        if total_pages == 0:
            raise ValueError("PDF has no pages!")
        if progress_cb:
            try:
                progress_cb({"event": "start", "total_pages": int(total_pages), "folder_id": str(folder_id)})
            except Exception:
                pass
    except Exception as e:
        print(f"ERROR opening PDF file: {e}")
        print(f"PDF path: {temp_pdf_path}")
        print(f"Path exists: {temp_pdf_path.exists()}")
        if temp_pdf_path.exists():
            print(f"File size: {temp_pdf_path.stat().st_size} bytes")
        raise
    
    # Verify we can access all pages
    try:
        for i in range(total_pages):
            test_page = doc[i]
            print(f"  Verified access to page {i+1}")
    except Exception as e:
        print(f"ERROR: Failed to access all pages: {e}")
        doc.close()
        raise
    
    # Process each page for FAI detection
    print("\n=== Phase 1: FAI Detection ===")
    for page_num in range(total_pages):
        try:
            print(f"\nProcessing page {page_num + 1}/{total_pages}...")
            page = doc[page_num]
            
            # Get text blocks from page
            blocks = page.get_text("blocks")
            print(f"  Raw blocks from PDF: {len(blocks)}")
            
            # Sort blocks by position
            blocks = sorted(blocks, key=lambda b: (b[1], b[0]))
            
            # Filter to text blocks only (non-empty)
            text_blocks = [(b[0], b[1], b[2], b[3], b[4].strip()) for b in blocks if b[4].strip()]
            print(f"  Text blocks (non-empty): {len(text_blocks)}")
            
            # Debug: Show first few text blocks
            if len(text_blocks) > 0:
                print(f"  Sample text blocks:")
                for idx, (x0, y0, x1, y1, text) in enumerate(text_blocks[:5]):
                    print(f"    [{idx}] '{text[:50]}' at ({x0:.1f}, {y0:.1f})")
                    # Check if this is an FAI label
                    if is_fai_label(text):
                        print(f"      *** FAI LABEL DETECTED: '{text}' ***")
            
            # Count FAI label blocks and find FAI pairs
            fai_label_blocks = [tb for tb in text_blocks if is_fai_label(tb[4])]
            fai_bubbles = find_fai_pairs(text_blocks)
            page_annotation_count = len(fai_bubbles)
            print(f"  Result: {page_annotation_count} FAI bubbles detected; {len(fai_label_blocks)} FAI label blocks found")
            if progress_cb:
                try:
                    progress_cb({
                        "event": "page_detected",
                        "page": int(page_num + 1),
                        "fai_count": int(page_annotation_count),
                        "fai_label_blocks": int(len(fai_label_blocks))
                    })
                except Exception:
                    pass
            
            # Store annotations
            annotation_added = False
            for x0, y0, x1, y1, label in fai_bubbles:
                all_annotations.append({
                    "page": page_num + 1,
                    "label": label,
                    "bbox": [x0, y0, x1, y1]
                })
                print(f"  ✓ Added annotation: '{label}' at page {page_num + 1}")
                annotation_added = True
            
            # Store page count
            per_page_counts[page_num + 1] = page_annotation_count
            
            if not annotation_added:
                print(f"  No annotations added for this page")
                
        except Exception as e:
            print(f"ERROR processing page {page_num + 1} for FAI detection: {e}")
            import traceback
            traceback.print_exc()
            per_page_counts[page_num + 1] = 0
    
    print(f"\nTotal annotations collected from all pages: {len(all_annotations)}")
    print(f"Annotation distribution by page:")
    page_counts = {}
    for ann in all_annotations:
        page_num = ann["page"]
        page_counts[page_num] = page_counts.get(page_num, 0) + 1
    for page_num in sorted(page_counts.keys()):
        print(f"  Page {page_num}: {page_counts[page_num]} annotations")
    doc.close()
    
    # Reopen for image extraction
    print("\n=== Phase 2: Image Extraction and Annotation Creation ===")
    doc = fitz.open(str(temp_pdf_path))
    
    # Verify total_pages is still correct
    if len(doc) != total_pages:
        print(f"WARNING: Page count mismatch! Initial: {total_pages}, Now: {len(doc)}")
        total_pages = len(doc)
    
    # Extract images and create annotations
    for page_num in range(total_pages):
        try:
            print(f"\nProcessing page {page_num + 1}/{total_pages}...")
            page = doc[page_num]
            zoom_x = 150 / 72
            zoom_y = 150 / 72
            matrix = fitz.Matrix(zoom_x, zoom_y)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            
            img_name = f"{base_name}_page_{page_num + 1}.png"
            img_path = original_image_folder / img_name
            pix.save(str(img_path))
            print(f"  Saved image: {img_name}")
            
            img = Image.open(str(img_path))
            draw = ImageDraw.Draw(img)
            page_annotations = []
            yolo_lines = []
            
            # Get annotations for this specific page
            page_anns = [ann for ann in all_annotations if ann["page"] == page_num + 1]
            print(f"  Found {len(page_anns)} annotations for this page from {len(all_annotations)} total annotations")
            
            if len(page_anns) == 0:
                print(f"  WARNING: No annotations found for page {page_num + 1}")
                if all_annotations:
                    print(f"  Available annotations are for pages: {sorted(set(ann['page'] for ann in all_annotations))}")
            
            for ann in page_anns:
                label = ann["label"]
                if label not in class_map:
                    class_map[label] = class_counter
                    class_counter += 1
                class_id = class_map[label]
                
                pad = 5
                x0, y0, x1, y1 = ann["bbox"]
                ix0 = (x0 - pad) * zoom_x
                iy0 = (y0 - pad) * zoom_y
                ix1 = (x1 + pad) * zoom_x
                iy1 = (y1 + pad) * zoom_y
                
                x_center = (ix0 + ix1) / 2 / pix.width
                y_center = (iy0 + iy1) / 2 / pix.height
                width = (ix1 - ix0) / pix.width
                height = (iy1 - iy0) / pix.height
                
                draw.rectangle([ix0, iy0, ix1, iy1], outline="red", width=2)
                draw.text((ix0, iy0 - 10), label, fill="red")
                
                yolo_lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
                page_annotations.append({
                    "image": img_name,
                    "label": label,
                    "class_id": class_id,
                    "bbox": [ix0, iy0, ix1, iy1],
                    "yolo": [class_id, x_center, y_center, width, height]
                })
            
            # Save annotated image (optional, for preview)
            annotated_img_path = folder_path / "annotated_image" / img_name
            annotated_img_path.parent.mkdir(exist_ok=True)
            img.save(str(annotated_img_path))
            
            # Save YOLO format annotation file
            yolo_path = original_image_folder / f"{base_name}_page_{page_num + 1}.txt"
            with open(str(yolo_path), "w") as f:
                f.write("\n".join(yolo_lines))
            
            # Add annotations for this page to the total list
            image_annotations.extend(page_annotations)
            
            # Save page-specific annotation JSON file (always save, even if empty)
            page_annotations_json_path = original_image_folder / f"{base_name}_page_{page_num + 1}_annotations.json"
            try:
                with open(str(page_annotations_json_path), "w") as f:
                    json.dump(page_annotations, f, indent=2)
                
                # Verify the file was saved correctly
                if page_annotations_json_path.exists():
                    file_size = page_annotations_json_path.stat().st_size
                    print(f"  Saved {len(page_annotations)} annotations to: {page_annotations_json_path}")
                    print(f"  File size: {file_size} bytes")
                    if file_size < 10 and len(page_annotations) > 0:
                        print(f"  ERROR: File seems too small but has annotations!")
                    elif len(page_annotations) == 0:
                        print(f"  Note: File is empty (no annotations on this page)")
                else:
                    print(f"  ERROR: File was not created!")
                # Emit event for page completion
                if progress_cb:
                    try:
                        progress_cb({
                            "event": "page_completed",
                            "page": int(page_num + 1),
                            "fai_count": int(len(page_annotations))
                        })
                    except Exception:
                        pass
            except Exception as e:
                print(f"  ERROR: Failed to save annotation file: {e}")
                import traceback
                traceback.print_exc()
        except Exception as e:
            print(f"ERROR processing page {page_num + 1} for image extraction: {e}")
            import traceback
            traceback.print_exc()
            # Still create empty annotation file for this page
            try:
                page_annotations_json_path = original_image_folder / f"{base_name}_page_{page_num + 1}_annotations.json"
                with open(str(page_annotations_json_path), "w") as f:
                    json.dump([], f, indent=2)
                print(f"  Created empty annotation file due to error")
            except:
                pass
    
    doc.close()
    
    # Sort annotations by number in label
    all_annotations.sort(key=lambda ann: extract_number(ann["label"]))
    image_annotations.sort(key=lambda ann: extract_number(ann["label"]))
    
    # Debug: Print summary
    print(f"Total pages processed: {total_pages}")
    print(f"Total annotations found: {len(all_annotations)}")
    print(f"Total image annotations created: {len(image_annotations)}")
    
    # Group by image to verify
    image_groups = {}
    for ann in image_annotations:
        img_name = ann["image"]
        if img_name not in image_groups:
            image_groups[img_name] = []
        image_groups[img_name].append(ann)
    
    print(f"Images with annotations: {len(image_groups)}")
    for img_name, anns in sorted(image_groups.items()):
        print(f"  {img_name}: {len(anns)} annotations")
    
    # Save combined JSON files (for backward compatibility)
    annotations_json_path = original_image_folder / f"{base_name}_annotations.json"
    with open(str(annotations_json_path), "w") as f:
        json.dump(all_annotations, f, indent=2)
    
    image_annotations_json_path = folder_path / "image_annotations.json"
    with open(str(image_annotations_json_path), "w") as f:
        json.dump(image_annotations, f, indent=2)
    
    class_map_json_path = folder_path / "class_map.json"
    with open(str(class_map_json_path), "w") as f:
        json.dump(class_map, f, indent=2)
    
    return {
        "annotations": image_annotations,
        "class_map": class_map,
        "image_count": len(image_annotations),
        "original_image_folder": str(original_image_folder),
        "annotations_json_path": str(annotations_json_path),
        "image_annotations_json_path": str(image_annotations_json_path),
        "base_name": base_name,
        "total_pages": total_pages,
        "per_page_counts": per_page_counts
    }


def generate_output_images(
    annotations_json_path: str,
    original_image_folder: str,
    output_folder: str,
    draw_yolo: bool = False
) -> List[Dict[str, Any]]:
    """
    Generate cropped output images based on FAI annotation and region annotation.
    For each label:
    1. Draw FAI annotation (bbox) on the image
    2. Crop to the region annotation
    3. Save as PNG using label as filename (removing spaces)
    
    Args:
        annotations_json_path: Path to JSON file with annotations (including 'region' and 'bbox' fields)
        original_image_folder: Folder containing original images
        output_folder: Folder to save output images
        draw_yolo: Whether to draw YOLO annotation on output images (deprecated, always draws FAI bbox)
        
    Returns:
        List of dicts with 'label', 'filename', and 'file_path' for each generated image
    """
    output_path = Path(output_folder)
    output_path.mkdir(parents=True, exist_ok=True)
    
    with open(annotations_json_path, 'r') as f:
        annotations = json.load(f)
    
    valid_annotations = [a for a in annotations if "region" in a and "bbox" in a]
    generated_images = []
    
    for ann in valid_annotations:
        region = ann["region"]
        bbox = ann["bbox"]
        
        if len(region) == 4:
            rx, ry, rw, rh = region
        elif len(region) == 5:
            _, rx, ry, rw, rh = region
        else:
            continue
        
        if len(bbox) != 4:
            continue
        
        image_path = Path(original_image_folder) / ann["image"]
        if not image_path.exists():
            continue
        
        img = Image.open(str(image_path)).convert("RGB")
        width, height = img.size
        
        # Draw FAI annotation (bbox) on the image
        draw = ImageDraw.Draw(img)
        x1_fai, y1_fai, x2_fai, y2_fai = bbox
        # Ensure bbox coordinates are valid
        x1_fai = max(0, min(int(x1_fai), width))
        y1_fai = max(0, min(int(y1_fai), height))
        x2_fai = max(0, min(int(x2_fai), width))
        y2_fai = max(0, min(int(y2_fai), height))
        draw.rectangle([x1_fai, y1_fai, x2_fai, y2_fai], outline="red", width=3)
        
        # Optional: also draw label text
        if "label" in ann:
            try:
                draw.text((x1_fai, y1_fai - 15), ann["label"], fill="red")
            except:
                pass  # If text drawing fails, continue
        
        # Crop the region
        x1 = int(rx * width)
        y1 = int(ry * height)
        x2 = int((rx + rw) * width)
        y2 = int((ry + rh) * height)
        
        # Ensure crop coordinates are valid
        x1 = max(0, min(x1, width))
        y1 = max(0, min(y1, height))
        x2 = max(0, min(x2, width))
        y2 = max(0, min(y2, height))
        
        if x2 <= x1 or y2 <= y1:
            continue  # Invalid crop region
        
        cropped = img.crop((x1, y1, x2, y2))
        
        # Use label as filename, removing spaces and sanitizing
        label_name = ann.get("label", "unknown").replace(" ", "")
        # Sanitize filename - remove any characters that might cause issues
        label_name = "".join(c for c in label_name if c.isalnum() or c in ('-', '_'))
        if not label_name:
            label_name = "unknown"
        
        out_path = output_path / f"{label_name}.png"
        cropped.save(str(out_path))
        
        generated_images.append({
            "label": ann.get("label", "unknown"),
            "filename": f"{label_name}.png",
            "file_path": str(out_path)
        })
    
    return generated_images

