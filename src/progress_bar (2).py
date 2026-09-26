"""
Progress bar แบบแคปซูล (pill shape) เหมือนในภาพ
วาดด้วย Pillow (แม่นยำกว่า Canvas polygon) แล้วแสดงผลผ่าน tkinter
รันได้เลย: python progress_bar.py
ต้องมี Pillow ก่อน: pip install pillow
"""

import tkinter as tk
from PIL import Image, ImageDraw, ImageTk

BG_COLOR = "#0d1526"            # พื้นหลังหน้าต่าง (navy เข้ม)
TRACK_COLOR = (75, 84, 104)     # ราง (เทาอมฟ้า)
FILL_COLOR = (59, 155, 250)     # แถบเติม (ฟ้าสด)
TEXT_COLOR = "#3b9bfa"

SUPERSAMPLE = 4  # วาดภาพใหญ่กว่าจริงแล้วย่อ เพื่อให้ขอบโค้งเนียน (anti-alias)


def rounded_capsule(width, height, fill_rgba):
    """คืนภาพ PIL ของแคปซูลมุมโค้งเต็ม (pill shape), พื้นหลังโปร่งใส"""
    w, h = width * SUPERSAMPLE, height * SUPERSAMPLE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = h // 2
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=fill_rgba)
    img = img.resize((width, height), Image.LANCZOS)
    return img


class ProgressBar(tk.Frame):
    def __init__(self, master, percent=35, bar_width=210, bar_height=22):
        super().__init__(master, bg=BG_COLOR)
        self.bar_width = bar_width
        self.bar_height = bar_height

        self.label = tk.Label(
            self, text=f"{percent}%", fg=TEXT_COLOR, bg=BG_COLOR,
            font=("Segoe UI", 13, "bold")
        )
        self.label.pack(side="left", padx=(0, 12))

        self.canvas = tk.Canvas(
            self, width=bar_width, height=bar_height,
            bg=BG_COLOR, highlightthickness=0
        )
        self.canvas.pack(side="left")

        # เก็บ reference ภาพไว้กันโดน garbage collect
        self._track_img = None
        self._fill_img = None

        self.set_progress(percent)

    def set_progress(self, percent: float):
        percent = max(0, min(100, percent))
        self.canvas.delete("all")

        # วาดราง (เต็มความกว้าง)
        track_pil = rounded_capsule(self.bar_width, self.bar_height, TRACK_COLOR + (255,))
        self._track_img = ImageTk.PhotoImage(track_pil)
        self.canvas.create_image(0, 0, image=self._track_img, anchor="nw")

        # วาดแถบเติม (ความกว้างตาม %) หัวท้ายโค้งเท่ากับความสูงเสมอ
        fill_width = 0 if percent <= 0 else max(self.bar_height, round(self.bar_width * percent / 100))

        if fill_width > 0:
            fill_pil = rounded_capsule(fill_width, self.bar_height, FILL_COLOR + (255,))
            self._fill_img = ImageTk.PhotoImage(fill_pil)
            self.canvas.create_image(0, 0, image=self._fill_img, anchor="nw")

        self.label.config(text=f"{int(percent)}%")


def demo():
    root = tk.Tk()
    root.title("Progress Bar")
    root.configure(bg=BG_COLOR)

    bar = ProgressBar(root, percent=35)
    bar.pack(padx=30, pady=30)

    root.mainloop()


if __name__ == "__main__":
    demo()
