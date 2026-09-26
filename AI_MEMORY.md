# LionPOS AI Memory

> Project Memory (Decision Log)
> เวอร์ชัน: 1.0
> อัปเดต: 24/09/2026

---

## จุดประสงค์

ไฟล์นี้เก็บ "ความจำของโปรเจกต์" ที่เกิดจากการตัดสินใจร่วมกันระหว่างการพัฒนา
ไม่ใช่ Coding Rules (อยู่ใน PROJECT_RULES.md) และไม่ใช่ AI Behavior (อยู่ใน GEMINI.md)

---

# Architecture Memory

### Local-First เป็นหลัก

* SQLite เป็นแหล่งข้อมูลหลักของระบบ
* Supabase เป็น Mirror สำหรับ Sync เท่านั้น
* UI ห้ามเรียก Supabase โดยตรง
* Sync ต้องผ่าน `syncService.ts`

### Dashboard

* Dashboard ใช้ข้อมูลจริงจาก SQLite
* หลัง `await syncNow()` ต้องเรียก `await loadDashboardData()`
* ใช้ `useFocusEffect` รีเฟรชเมื่อกลับเข้าหน้า Dashboard
* `WeeklyBarChart` ต้องอยู่ใต้ KPI Cards

---

# Data Mapping

ใช้ชื่อ Field จริงของระบบ

| ความหมาย     | Field             |
| ------------ | ----------------- |
| ยอดขาย       | `revenue`         |
| จำนวนบิล     | `order_count`     |
| จำนวนสินค้า  | `qty`             |
| จำนวนคงเหลือ | `quantity`        |
| จุดแจ้งเตือน | `low_stock_alert` |

ห้ามเดาชื่อ Field เอง

---

# UI Memory

ธีมหลัก

* Dark Theme `#0F172A`
* Surface `#1E293B`
* Accent `#FF8A00`
* Accent Hover `#F59E0B`

Bottom Navigation

* Dashboard
* ขาย
* สต็อก
* รายงาน
* เพิ่มเติม
* ตั้งค่า

ห้ามเปลี่ยน Flow โดยไม่ทำ Patch Review

### KPI

* รักษา KPI Trend เดิม
* ถ้าไม่มีข้อมูล ให้แสดง `0%`
* ห้ามลบ Trend ออก

---

# Patch Workflow Memory

ก่อนแก้ทุกครั้ง

* Patch Review
* รอคำว่า "อนุมัติ"

หลังแก้ทุกครั้ง

* `npx tsc --noEmit`
* แยกผลเป็น

  * Errors ในไฟล์ที่แก้
  * Existing Errors
* สรุป Changed Files
* ระบุ Rollback Note

---

# Known Existing Issues

ลำดับการแก้

## P0

* `printer.ts`

  * `printReceipt`
  * `reconnectSavedPrinter`

* `repository.ts`

  * `currentShift`
  * `closeShift`

## P1

* `react-native-svg`
* `@types/react-native-sqlite-storage`
* Lion Components

## P2

* ไฟล์ Backup
* ไฟล์ Copy

---

# Things We Never Assume

ก่อนเขียนโค้ด

* อ่าน Signature จริง
* อ่าน Return Type จริง
* อ่าน Field จริง
* ไม่เดาชื่อฟังก์ชัน

---

# Decision Log

## 24/09/2026

* Dashboard เปลี่ยนจาก Mock Data เป็น SQLite จริง
* ใช้ `syncNow()` ผ่าน `syncService.ts`
* เพิ่ม `useFocusEffect`
* คืน `WeeklyBarChart`
* กำหนด Patch Review v2.1 เป็นมาตรฐาน
* บังคับ Type Check ก่อนปิดงาน
