"""
Progress bar สไตล์ dark theme (เหมือนในภาพ) ทำด้วย tkinter + Canvas
รันได้เลย: python progress_bar.py
"""

import tkinter as tk
import time

BG_COLOR = "#0d1526"       # พื้นหลังกรอบนอก (navy เข้ม)
TRACK_COLOR = "#4b5468"    # รางสีเทาอมฟ้า (พื้นหลังของแถบ)
FILL_COLOR = "#3b9bfa"     # สีฟ้าของแถบที่เติม
TEXT_COLOR = "#3b9bfa"     # สีตัวเลขเปอร์เซ็นต์


def draw_rounded_rect(canvas, x1, y1, x2, y2, radius, **kwargs):
    """วาดสี่เหลี่ยมมุมโค้งบน Canvas (tkinter ไม่มีฟังก์ชันนี้ในตัว)"""
    points = [
        x1 + radius, y1,
        x2 - radius, y1,
        x2, y1,
        x2, y1 + radius,
        x2, y2 - radius,
        x2, y2,
        x2 - radius, y2,
        x1 + radius, y2,
        x1, y2,
        x1, y2 - radius,
        x1, y1 + radius,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


class ProgressBar:
    def __init__(self, root, width=210, height=22):
        self.width = width
        self.height = height

        self.canvas = tk.Canvas(
            root, width=width + 90, height=height + 20,
            bg=BG_COLOR, highlightthickness=0
        )
        self.canvas.pack(padx=20, pady=20)

        # ตัวเลข % ทางซ้าย
        self.label = self.canvas.create_text(
            26, (height + 20) // 2,
            text="0%", fill=TEXT_COLOR,
            font=("Segoe UI", 13, "bold")
        )

        # ราง (track) มุมโค้ง
        self.track_x1 = 55
        self.track_y1 = 10
        self.track_x2 = self.track_x1 + width
        self.track_y2 = self.track_y1 + height
        self.radius = height // 2

        draw_rounded_rect(
            self.canvas, self.track_x1, self.track_y1,
            self.track_x2, self.track_y2, self.radius,
            fill=TRACK_COLOR, outline=""
        )

        # แถบเติม (fill) เริ่มที่ 0
        self.fill_id = draw_rounded_rect(
            self.canvas, self.track_x1, self.track_y1,
            self.track_x1, self.track_y2, self.radius,
            fill=FILL_COLOR, outline=""
        )

    def set_progress(self, percent: float):
        """percent: 0-100"""
        percent = max(0, min(100, percent))
        fill_width = self.width * (percent / 100)
        x2 = self.track_x1 + fill_width

        # ลบแล้ววาดแถบเติมใหม่ (เพื่อให้มุมโค้งถูกต้องทุกความยาว)
        self.canvas.delete(self.fill_id)
        if fill_width > 0:
            r = min(self.radius, fill_width / 2) if fill_width < self.height else self.radius
            self.fill_id = draw_rounded_rect(
                self.canvas, self.track_x1, self.track_y1,
                x2, self.track_y2, r,
                fill=FILL_COLOR, outline=""
            )
        self.canvas.tag_lower(self.fill_id)
        self.canvas.itemconfig(self.label, text=f"{int(percent)}%")


def demo():
    root = tk.Tk()
    root.title("Progress Bar Demo")
    root.configure(bg=BG_COLOR)

    bar = ProgressBar(root)
    bar.set_progress(35)  # ตรงกับภาพตัวอย่าง (35%) ค้างไว้แบบนี้ ไม่มีแอนิเมชัน

    root.mainloop()


if __name__ == "__main__":
    demo()
