import os
import re
import json
import shutil
import fitz  # PyMuPDF
from datetime import datetime
from PIL import Image, ImageDraw, ImageTk, ImageFont
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

Image.MAX_IMAGE_PIXELS = None  # Avoid decompression bomb error

def is_fai_label(text):
    text = text.upper().replace(" ", "")
    return "FAI" in text or "FA1" in text

def find_fai_pairs(blocks):
    fai_pairs = []
    for i, block in enumerate(blocks):
        x0, y0, x1, y1, text = block
        if is_fai_label(text):
            for j, other in enumerate(blocks):
                if i == j:
                    continue
                tx0, ty0, tx1, ty1, ttext = other
                if (
                    abs(tx0 - x0) < 50 and
                    0 < (ty0 - y1) < 60 and
                    re.match(r"^\d+$", ttext.strip())
                ):
                    cx0 = min(x0, tx0)
                    cy0 = min(y0, ty0)
                    cx1 = max(x1, tx1)
                    cy1 = max(y1, ty1)
                    label = f"{text} {ttext.strip()}"
                    fai_pairs.append((cx0, cy0, cx1, cy1, label))
                    break
    return fai_pairs

def extract_number(label):
    match = re.search(r'\b(\d+)\b', label)
    return int(match.group(1)) if match else float('inf')

def process_pdfs(input_folder, base_output_folder, progress_callback):
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    output_root = os.path.join(base_output_folder, timestamp)
    os.makedirs(output_root, exist_ok=True)

    pdf_files = [f for f in os.listdir(input_folder) if f.lower().endswith(".pdf")]
    total_files = len(pdf_files)

    for idx, filename in enumerate(pdf_files, 1):
        base_name = os.path.splitext(filename)[0]
        pdf_output_folder = os.path.join(output_root, base_name)
        folders = {
            "original_pdf": os.path.join(pdf_output_folder, "original_pdf"),
            "annotated_pdf": os.path.join(pdf_output_folder, "annotated_pdf"),
            "original_image": os.path.join(pdf_output_folder, "original_image"),
            "annotated_image": os.path.join(pdf_output_folder, "annotated_image"),
        }
        for folder in folders.values():
            os.makedirs(folder, exist_ok=True)

        class_map = {}
        class_counter = 0
        image_annotations = []
        all_annotations = []

        pdf_path = os.path.join(input_folder, filename)
        shutil.copy(pdf_path, os.path.join(folders["original_pdf"], filename))

        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]
            blocks = page.get_text("blocks")
            blocks = sorted(blocks, key=lambda b: (b[1], b[0]))
            text_blocks = [(b[0], b[1], b[2], b[3], b[4].strip()) for b in blocks if b[4].strip()]
            fai_bubbles = find_fai_pairs(text_blocks)

            for x0, y0, x1, y1, label in fai_bubbles:
                page.draw_rect(fitz.Rect(x0, y0, x1, y1), color=(1, 0, 0), width=1)
                page.insert_text((x0, y0 - 8), label, fontsize=6, color=(1, 0, 0))
                all_annotations.append({
                    "page": page_num + 1,
                    "label": label,
                    "bbox": [x0, y0, x1, y1]
                })

        doc.save(os.path.join(folders["annotated_pdf"], f"{base_name}_annotated.pdf"))
        doc.close()

        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]
            zoom_x = 150 / 72
            zoom_y = 150 / 72
            matrix = fitz.Matrix(zoom_x, zoom_y)
            pix = page.get_pixmap(matrix=matrix, alpha=False)

            img_name = f"{base_name}_page_{page_num + 1}.png"
            img_path = os.path.join(folders["original_image"], img_name)
            pix.save(img_path)

            img = Image.open(img_path)
            draw = ImageDraw.Draw(img)
            page_annotations = []
            yolo_lines = []

            for ann in all_annotations:
                if ann["page"] == page_num + 1:
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

            img.save(os.path.join(folders["annotated_image"], img_name))
            with open(os.path.join(folders["original_image"], f"{base_name}_page_{page_num + 1}.txt"), "w") as f:
                f.write("\n".join(yolo_lines))

            image_annotations.extend(page_annotations)

        doc.close()

        # Sort both outputs by number in label
        all_annotations.sort(key=lambda ann: extract_number(ann["label"]))
        image_annotations.sort(key=lambda ann: extract_number(ann["label"]))

        with open(os.path.join(folders["original_pdf"], f"{base_name}_annotations.json"), "w") as f:
            json.dump(all_annotations, f, indent=2)
        with open(os.path.join(pdf_output_folder, "image_annotations.json"), "w") as f:
            json.dump(image_annotations, f, indent=2)
        with open(os.path.join(pdf_output_folder, "class_map.json"), "w") as f:
            json.dump(class_map, f, indent=2)

        progress_callback(int(idx / total_files * 100))

    return output_root

def launch_gui():
    window = tk.Tk()
    window.title("FAI PDF Annotation Tool")
    window.geometry("600x300")

    input_path = tk.StringVar()
    output_path = tk.StringVar()

    def browse_input():
        path = filedialog.askdirectory()
        if path:
            input_path.set(path)

    def browse_output():
        path = filedialog.askdirectory()
        if path:
            output_path.set(path)

    def start():
        if not input_path.get() or not output_path.get():
            messagebox.showerror("Error", "Please select both folders.")
            return

        def update_progress(value):
            progress_bar["value"] = value
            window.update_idletasks()

        try:
            result = process_pdfs(input_path.get(), output_path.get(), update_progress)
            messagebox.showinfo("Done", f"All PDFs processed!\nOutput folder:\n{result}")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    tk.Label(window, text="Input Folder").pack()
    tk.Button(window, text="Select Input Folder", command=browse_input).pack()
    tk.Label(window, textvariable=input_path, wraplength=550).pack()

    tk.Label(window, text="Base Output Folder").pack()
    tk.Button(window, text="Select Output Folder", command=browse_output).pack()
    tk.Label(window, textvariable=output_path, wraplength=550).pack()

    tk.Button(window, text="Start Processing", command=start, bg="green", fg="white").pack(pady=10)

    progress_bar = ttk.Progressbar(window, orient="horizontal", length=500, mode="determinate")
    progress_bar.pack(pady=10)

    tk.Label(window, text="© By Dr J. Sun Tools 2025 For LY Internal Use Only", fg="gray").pack(side="bottom", pady=5)
    window.mainloop()

if __name__ == "__main__":
    launch_gui()
