# LionPOS Decision Log

> บันทึกการตัดสินใจของโปรเจกต์ (Decision History)
> เวอร์ชัน: 1.0
> เริ่มบันทึก: 24/09/2026

---

## วิธีใช้งาน

* บันทึกเฉพาะ "การตัดสินใจ" ไม่ใช่ทุก Commit
* ทุกครั้งที่มีการเปลี่ยนสถาปัตยกรรมหรือ Workflow ให้เพิ่มรายการใหม่
* AI ต้องอ่านไฟล์นี้ก่อนเสนอการเปลี่ยนแปลงใหญ่

---

# 24/09/2026 — Dashboard เปลี่ยนเป็น SQLite จริง

**ปัญหา**

* Dashboard ใช้ Mock Data
* ปุ่ม Sync ยิง Supabase ผิดตาราง (`hashrate_history`)
* กราฟ 7 วันไม่แสดง

**การตัดสินใจ**

* ใช้ SQLite เป็นแหล่งข้อมูลหลัก
* Sync ผ่าน `syncService.ts` เท่านั้น
* เพิ่ม `useFocusEffect`
* คืน `WeeklyBarChart`
* หลัง `syncNow()` ต้องเรียก `loadDashboardData()`

**ไฟล์ที่เกี่ยวข้อง**

* `DashboardScreen.tsx`

**เหตุผล**

เพื่อให้ Dashboard แสดงข้อมูลจริงและไม่ละเมิดสถาปัตยกรรม Local-First

---

# 24/09/2026 — กำหนด Patch Review v2.1

**การตัดสินใจ**

ก่อนแก้โค้ดทุกครั้งต้องมี

1. Issue Summary
2. Changed Files
3. Impact
4. Risk
5. Patch Preview
6. รอคำว่า "อนุมัติ"

หลังแก้ต้องมี

* `npx tsc --noEmit`
* Verification
* Rollback Note

**เหตุผล**

ป้องกัน AI แก้โค้ดโดยไม่ตรวจสอบ

---

# 24/09/2026 — AI Agent มาตรฐานของ LionPOS

**การตัดสินใจ**

ใช้ไฟล์ 3 ตัวเป็นความจำของโปรเจกต์

* `GEMINI.md`
* `PROJECT_RULES.md`
* `AI_MEMORY.md`

และให้ AI อ่าน `DECISION_LOG.md` ก่อนเสนอการเปลี่ยนแปลงใหญ่

**เหตุผล**

เพื่อให้ AI ทุกตัวทำงานต่อจากบริบทเดียวกัน

---

# รูปแบบการเพิ่มรายการใหม่

## YYYY-MM-DD — ชื่อการตัดสินใจ

### ปัญหา

...

### การตัดสินใจ

...

### ไฟล์ที่เกี่ยวข้อง

...

### เหตุผล

...
