
import tkinter as tk

BG = "#041B4A"
TRACK = "#1F2A3A"
TRACK_EDGE = "#56657A"
FILL = "#55B8FF"
GREEN = "#22E55A"
WHITE = "#EAF2FF"

BAR_W = 108
BAR_H = 8


class CapsuleBar:
    def __init__(self, canvas, x, y, width=BAR_W, height=BAR_H):
        self.cv=canvas
        self.x,self.y=x,y
        self.w,self.h=width,height
        self.r=height/2

        # Track (capsule จริง)
        self.t_left=canvas.create_oval(x,y,x+height,y+height,fill=TRACK,outline=TRACK_EDGE,width=1)
        self.t_mid=canvas.create_rectangle(x+self.r,y,x+width-self.r,y+height,fill=TRACK,outline=TRACK_EDGE,width=1)
        self.t_right=canvas.create_oval(x+width-height,y,x+width,y+height,fill=TRACK,outline=TRACK_EDGE,width=1)

        # เก็บเส้นขอบให้ต่อเนื่อง
        canvas.create_line(x+self.r,y,x+width-self.r,y,fill=TRACK_EDGE,width=1)
        canvas.create_line(x+self.r,y+height,x+width-self.r,y+height,fill=TRACK_EDGE,width=1)

        # Fill (ลดรอยต่อวงกลม)
        self.f_left=canvas.create_oval(x+2,y+2,x+height-2,y+height-2,fill=FILL,outline="")
        self.f_mid=canvas.create_rectangle(x+self.r-1,y+2,x+self.r-1,y+height-2,fill=FILL,outline="")
        self.f_right=canvas.create_oval(x+self.r-1,y+2,x+self.r+1,y+height-2,fill=FILL,outline="")
        self.set(0)

    def set(self,pct):
        pct=max(0,min(100,pct))
        fw=(self.w-4)*pct/100

        for item in (self.f_left,self.f_mid,self.f_right):
            self.cv.itemconfigure(item,state="hidden")
        if fw<=0:
            return

        self.cv.itemconfigure(self.f_left,state="normal")
        if fw<=self.h-4:
            self.cv.coords(self.f_left,self.x+2,self.y+2,self.x+2+fw,self.y+self.h-2)
            return

        self.cv.coords(self.f_left,self.x+2,self.y+2,self.x+self.h-2,self.y+self.h-2)
        self.cv.itemconfigure(self.f_mid,state="normal")

        if fw>=(self.w-4)-(self.h-4):
            self.cv.itemconfigure(self.f_right,state="normal")
            self.cv.coords(self.f_right,self.x+self.w-self.h+2,self.y+2,self.x+self.w-2,self.y+self.h-2)
            mid_end=self.x+self.w-self.r
        else:
            mid_end=self.x+2+fw

        self.cv.coords(self.f_mid,self.x+self.r,self.y+2,max(self.x+self.r,mid_end),self.y+self.h-2)

root = tk.Tk()
root.title("LionPOS Capsule Prototype")
root.configure(bg=BG)
root.geometry("360x250")

cv = tk.Canvas(root, width=360, height=250, bg=BG, highlightthickness=0)
cv.pack()

items = [
    ("100%", 100),
    ("100%", 100),
    ("100%", 100),
    ("35%", 35),
    ("0%", 0),
]

y = 30
for txt, pct in items:
    cv.create_text(60, y+5, text=txt,
                   fill=GREEN if pct==100 else WHITE,
                   font=("Segoe UI", 12, "bold"))
    bar = CapsuleBar(cv, 120, y, BAR_W, BAR_H)
    bar.set(pct)
    y += 40

root.mainloop()
