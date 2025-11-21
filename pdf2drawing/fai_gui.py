from datetime import datetime
import sys, os, json
from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QFileDialog, QLabel, QListWidget, QListWidgetItem, QGraphicsView,
    QGraphicsScene, QGraphicsPixmapItem, QSplitter, QMessageBox
)
from PySide6.QtGui import QPixmap, QWheelEvent, QColor, QBrush
from PySide6.QtCore import Qt, QRectF
from PIL import Image, ImageDraw
from PIL.ImageQt import ImageQt


class ZoomableGraphicsView(QGraphicsView):
    def __init__(self):
        super().__init__()
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.AnchorUnderMouse)
        self.zoom_factor = 1.15

    def wheelEvent(self, event: QWheelEvent):
        if event.angleDelta().y() > 0:
            self.scale(self.zoom_factor, self.zoom_factor)
        else:
            self.scale(1 / self.zoom_factor, 1 / self.zoom_factor)


class AnnotationViewer(QWidget):

    def save_json_file(self):
        if not hasattr(self, "annotations") or not self.annotations:
            QMessageBox.warning(self, "Warning", "No annotation data to save.")
            return

        folder = QFileDialog.getExistingDirectory(self, "Select Folder to Save JSON")
        if not folder:
            return

        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        file_path = os.path.join(folder, f"edited_annotations_{timestamp}.json")

        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(self.annotations, f, indent=4)
            QMessageBox.information(self, "Success", f"File saved to:\n{file_path}")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to save JSON:\n{str(e)}")

    def __init__(self):
        super().__init__()
        self.setWindowTitle("FAI Annotation Viewer with Zoom By Dr J. Sun")
        self.setMinimumSize(1300, 800)

        self.annotations = []
        self.current_index = 0
        self.image_folder = ""
        self.json_path = ""

        # --- Top Controls ---
        top_bar = QWidget()
        top_layout = QHBoxLayout(top_bar)
        self.btn_json = QPushButton("📂 Load JSON")
        self.btn_json.clicked.connect(self.load_json)
        self.btn_img_folder = QPushButton("🖼️ Set Image Folder")
        self.btn_img_folder.clicked.connect(self.set_image_folder)
        self.label_status = QLabel("Ready")
        top_layout.addWidget(self.btn_json)
        top_layout.addWidget(self.btn_img_folder)
        top_layout.addWidget(self.label_status)
        top_bar.setLayout(top_layout)

        # --- Left Panel ---
        self.annotation_list = QListWidget()
        self.annotation_list.currentRowChanged.connect(self.on_select_annotation)
        self.btn_view_region = QPushButton("🔍 View Region")
        self.btn_view_region.clicked.connect(self.view_region)
        left_panel = QVBoxLayout()
        left_panel.addWidget(QLabel("Annotation List"))
        left_panel.addWidget(self.annotation_list)
        left_panel.addWidget(self.btn_view_region)
        left_widget = QWidget()
        left_widget.setLayout(left_panel)

        # --- Right Panel ---
        self.scene = QGraphicsScene()
        self.view = ZoomableGraphicsView()
        self.view.setScene(self.scene)
        self.btn_add_region = QPushButton("➕ Add Region Annotation")
        self.btn_add_region.clicked.connect(self.add_region_annotation)
        self.btn_prev = QPushButton("← Previous")
        self.btn_prev.clicked.connect(self.show_prev)
        self.btn_next = QPushButton("Next →")
        self.btn_next.clicked.connect(self.show_next)
        nav_bar = QHBoxLayout()
        nav_bar.addWidget(self.btn_prev)
        nav_bar.addWidget(self.btn_next)
        nav_bar.addWidget(self.btn_add_region)
        right_panel = QVBoxLayout()
        right_panel.addWidget(self.view)
        right_panel.addLayout(nav_bar)
        right_widget = QWidget()
        right_widget.setLayout(right_panel)

        # --- Splitters ---
        middle_splitter = QSplitter(Qt.Horizontal)
        middle_splitter.addWidget(left_widget)
        middle_splitter.addWidget(right_widget)

        outer_splitter = QSplitter(Qt.Vertical)
        outer_splitter.addWidget(top_bar)
        outer_splitter.addWidget(middle_splitter)

        # --- Main Layout ---
        layout = QVBoxLayout()
        save_button = QPushButton("Save JSON")
        save_button.clicked.connect(self.save_json_file)
        layout.addWidget(save_button)
        layout.addWidget(outer_splitter)
        self.setLayout(layout)

    def load_json(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Select JSON File", "", "JSON Files (*.json)")
        if not file_path:
            return
        self.json_path = file_path
        with open(file_path, 'r') as f:
            self.annotations = json.load(f)
        self.label_status.setText(f"Loaded {len(self.annotations)} entries")
        self.populate_list()
        self.show_annotation(0)
        self.update_highlight()

    def set_image_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Image Folder")
        if folder:
            self.image_folder = folder
            self.label_status.setText(f"Image folder: {folder}")
            self.show_annotation(self.current_index)

    def populate_list(self):
        self.annotation_list.clear()
        for i, ann in enumerate(self.annotations):
            region_status = "✅" if "region" in ann else "❌"
            item_text = f"{ann['image']} - {ann['label']} {region_status}"
            item = QListWidgetItem(item_text)
            self.annotation_list.addItem(item)

    def update_highlight(self):
        for i in range(self.annotation_list.count()):
            item = self.annotation_list.item(i)
            if i == self.current_index:
                item.setBackground(QBrush(QColor("#cceeff")))  # light blue
            else:
                item.setBackground(QBrush(Qt.white))

    def on_select_annotation(self, index):
        if 0 <= index < len(self.annotations):
            self.current_index = index
            self.show_annotation(index)
            self.update_highlight()

    def show_prev(self):
        if not self.annotations:
            return
        self.current_index = (self.current_index - 1) % len(self.annotations)
        self.annotation_list.setCurrentRow(self.current_index)
        self.annotation_list.scrollToItem(self.annotation_list.item(self.current_index), QListWidget.PositionAtCenter)

    def show_next(self):
        if not self.annotations:
            return
        self.current_index = (self.current_index + 1) % len(self.annotations)
        self.annotation_list.setCurrentRow(self.current_index)
        self.annotation_list.scrollToItem(self.annotation_list.item(self.current_index), QListWidget.PositionAtCenter)

    def show_annotation(self, index, show_region=False):
        if not self.annotations or not self.image_folder:
            return

        selected = self.annotations[index]
        image_path = os.path.join(self.image_folder, selected["image"])
        if not os.path.exists(image_path):
            self.scene.clear()
            self.scene.addText(f"Image not found: {selected['image']}")
            return

        img = Image.open(image_path).convert("RGB")
        width, height = img.size
        draw = ImageDraw.Draw(img)

        if show_region and "region" in selected:
            rx, ry, rw, rh = selected["region"]
            x1, y1 = rx * width, ry * height
            x2, y2 = x1 + rw * width, y1 + rh * height
            draw.rectangle([x1, y1, x2, y2], outline="blue", width=3)
            draw.text((x1, y1 - 10), "region", fill="blue")
        else:
            x1, y1, x2, y2 = selected["bbox"]
            draw.rectangle([x1, y1, x2, y2], outline="red", width=3)
            draw.text((x1, y1 - 10), selected["label"], fill="red")

        qimage = ImageQt(img)
        pixmap = QPixmap.fromImage(qimage)

        self.scene.clear()
        pixmap_item = QGraphicsPixmapItem(pixmap)
        self.scene.addItem(pixmap_item)
        self.view.setSceneRect(QRectF(pixmap.rect()))
        self.view.resetTransform()

        if show_region and "region" in selected:
            zoom_rect = QRectF(x1, y1, x2 - x1, y2 - y1)
            self.view.fitInView(zoom_rect, Qt.KeepAspectRatio)
        else:
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            zoom_w = width / 6
            zoom_h = height / 6
            zoom_rect = QRectF(cx - zoom_w / 2, cy - zoom_h / 2, zoom_w, zoom_h)
            self.view.fitInView(zoom_rect, Qt.KeepAspectRatio)

    def add_region_annotation(self):
        if not self.annotations or not self.image_folder:
            return

        selected = self.annotations[self.current_index]
        image_path = os.path.join(self.image_folder, selected["image"])
        if not os.path.exists(image_path):
            return

        img = Image.open(image_path).convert("RGB")
        width, height = img.size

        visible_rect = self.view.mapToScene(self.view.viewport().rect()).boundingRect()
        norm_x = visible_rect.left() / width
        norm_y = visible_rect.top() / height
        norm_w = visible_rect.width() / width
        norm_h = visible_rect.height() / height

        selected["region"] = [norm_x, norm_y, norm_w, norm_h]

        if self.json_path:
            with open(self.json_path, 'w') as f:
                json.dump(self.annotations, f, indent=2)

        expected_prefix = f"{selected['image']} - {selected['label']}"

        self.annotation_list.blockSignals(True)
        self.populate_list()
        self.annotation_list.blockSignals(False)

        for i in range(self.annotation_list.count()):
            text = self.annotation_list.item(i).text()
            if text.startswith(expected_prefix):
                self.current_index = i
                self.annotation_list.setCurrentRow(i)
                self.annotation_list.scrollToItem(self.annotation_list.item(i), QListWidget.PositionAtCenter)
                break

        self.update_highlight()
        self.show_annotation(self.current_index, show_region=True)

    def view_region(self):
        if not self.annotations:
            return
        selected = self.annotations[self.current_index]
        if "region" not in selected:
            QMessageBox.information(self, "No Region", "This annotation has no region defined.")
            return
        self.show_annotation(self.current_index, show_region=True)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    viewer = AnnotationViewer()
    viewer.show()
    sys.exit(app.exec())