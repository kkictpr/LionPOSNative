
import tkinter as tk

BG = "#041B4A"
TRACK = "#1F2A3A"
TRACK_EDGE = "#56657A"
FILL = "#55B8FF"

BAR_W = 120
BAR_H = 8

def draw_capsule(canvas, x, y, width=BAR_W, height=BAR_H):
    r = height / 2

    # Track (เต็มหลอด)
    canvas.create_oval(x, y, x+height, y+height,
                       fill=TRACK, outline=TRACK_EDGE, width=1)
    canvas.create_rectangle(x+r, y, x+width-r, y+height,
                            fill=TRACK, outline=TRACK_EDGE, width=1)
    canvas.create_oval(x+width-height, y, x+width, y+height,
                       fill=TRACK, outline=TRACK_EDGE, width=1)

    # เก็บรอยต่อด้านบน/ล่าง
    canvas.create_line(x+r, y, x+width-r, y,
                       fill=TRACK_EDGE, width=1)
    canvas.create_line(x+r, y+height, x+width-r, y+height,
                       fill=TRACK_EDGE, width=1)

    # Fill (100%)
    m = 2
    fy = y + m
    fh = height - m*2
    fr = max(1, fh/2)

    canvas.create_oval(x+m, fy, x+m+fh, fy+fh,
                       fill=FILL, outline="")
    canvas.create_rectangle(x+m+fr, fy, x+width-m-fr, fy+fh,
                            fill=FILL, outline="")
    canvas.create_oval(x+width-m-fh, fy, x+width-m, fy+fh,
                       fill=FILL, outline="")

root = tk.Tk()
root.title("Capsule Full Bar Test")
root.configure(bg=BG)
root.geometry("320x140")

cv = tk.Canvas(root, width=320, height=140,
               bg=BG, highlightthickness=0)
cv.pack()

draw_capsule(cv, 60, 35)
draw_capsule(cv, 60, 75)

root.mainloop()
