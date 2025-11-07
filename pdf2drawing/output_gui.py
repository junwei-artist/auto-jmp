import os
import json
import time
import threading
from tkinter import Tk, Label, Button, filedialog, messagebox, Entry, BooleanVar, Checkbutton
from tkinter import ttk
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None  # Handle large images

class AnnotationCropperApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Annotation Cropper")

        Label(root, text="JSON File:").grid(row=0, column=0, sticky="e")
        self.json_entry = Entry(root, width=60)
        self.json_entry.grid(row=0, column=1)
        Button(root, text="Browse", command=self.browse_json).grid(row=0, column=2)

        Label(root, text="Image Folder:").grid(row=1, column=0, sticky="e")
        self.image_folder_entry = Entry(root, width=60)
        self.image_folder_entry.grid(row=1, column=1)
        Button(root, text="Browse", command=self.browse_image_folder).grid(row=1, column=2)

        Label(root, text="Output Folder:").grid(row=2, column=0, sticky="e")
        self.output_folder_entry = Entry(root, width=60)
        self.output_folder_entry.grid(row=2, column=1)
        Button(root, text="Browse", command=self.browse_output_folder).grid(row=2, column=2)

        # Checkbox for drawing YOLO annotation
        self.draw_yolo = BooleanVar(value=False)
        Checkbutton(root, text="Draw YOLO annotation", variable=self.draw_yolo).grid(row=3, column=1, pady=(0, 10))

        self.progress = ttk.Progressbar(root, orient="horizontal", length=400, mode="determinate")
        self.progress.grid(row=4, column=0, columnspan=3, pady=10)

        self.start_button = Button(root, text="Start", command=self.start_processing)
        self.start_button.grid(row=5, column=1, pady=5)

    def browse_json(self):
        path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if path:
            self.json_entry.delete(0, 'end')
            self.json_entry.insert(0, path)

    def browse_image_folder(self):
        path = filedialog.askdirectory()
        if path:
            self.image_folder_entry.delete(0, 'end')
            self.image_folder_entry.insert(0, path)

    def browse_output_folder(self):
        path = filedialog.askdirectory()
        if path:
            self.output_folder_entry.delete(0, 'end')
            self.output_folder_entry.insert(0, path)

    def start_processing(self):
        json_path = self.json_entry.get()
        image_folder = self.image_folder_entry.get()
        output_folder = self.output_folder_entry.get()

        if not all([os.path.exists(p) for p in [json_path, image_folder, output_folder]]):
            messagebox.showerror("Error", "Please specify valid paths for all folders.")
            return

        self.start_button.config(state="disabled")
        self.progress["value"] = 0

        threading.Thread(target=self.process_images, args=(json_path, image_folder, output_folder)).start()

    def process_images(self, json_path, image_folder, output_folder):
        try:
            with open(json_path, 'r') as f:
                annotations = json.load(f)
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Error", f"Failed to read JSON: {e}"))
            self.root.after(0, lambda: self.start_button.config(state="normal"))
            return

        valid_annotations = [a for a in annotations if "region" in a]
        total = len(valid_annotations)
        self.root.after(0, lambda: self.progress.config(maximum=total))

        for i, ann in enumerate(valid_annotations):
            try:
                region = ann["region"]
                if len(region) == 4:
                    rx, ry, rw, rh = region
                elif len(region) == 5:
                    _, rx, ry, rw, rh = region
                else:
                    continue

                image_path = os.path.join(image_folder, ann["image"])
                if not os.path.exists(image_path):
                    continue

                img = Image.open(image_path).convert("RGB")
                width, height = img.size

                # Optional YOLO annotation
                if self.draw_yolo.get() and "yolo" in ann and len(ann["yolo"]) == 5:
                    _, cx, cy, w, h = ann["yolo"]
                    x1_yolo = int((cx - w / 2) * width)
                    y1_yolo = int((cy - h / 2) * height)
                    x2_yolo = int((cx + w / 2) * width)
                    y2_yolo = int((cy + h / 2) * height)
                    draw = ImageDraw.Draw(img)
                    draw.rectangle([x1_yolo, y1_yolo, x2_yolo, y2_yolo], outline="red", width=3)

                # Crop the region
                x1 = int(rx * width)
                y1 = int(ry * height)
                x2 = int((rx + rw) * width)
                y2 = int((ry + rh) * height)

                cropped = img.crop((x1, y1, x2, y2))
                label_name = ann["label"].replace(" ", "")
                out_path = os.path.join(output_folder, f"{label_name}.png")
                cropped.save(out_path)

            except Exception as e:
                print(f"Error processing image {ann.get('image', '')}: {e}")

            self.root.after(0, lambda val=i+1: self.progress.config(value=val))

        self.root.after(0, lambda: messagebox.showinfo("Done", f"Finished. Cropped images saved to:\n{output_folder}"))
        self.root.after(0, lambda: self.start_button.config(state="normal"))

# Run the app
if __name__ == "__main__":
    root = Tk()
    app = AnnotationCropperApp(root)
    root.mainloop()
