
# Saku Project Rules

## ภาษา
- ตอบเป็นภาษาไทย
- อธิบายก่อนแก้โค้ดทุกครั้ง

## โปรเจกต์
- React Native + Expo
- ห้ามลบฟีเจอร์เดิม
- แก้เฉพาะไฟล์ที่จำเป็น

## UI
- Dark Theme
- รักษา Bottom Navigation
- ใช้สไตล์เดียวกับ Saku Launcher

## Cloud
- ใช้ Supabase/Firebase ตามโครงสร้างเดิม

## ทุกครั้งก่อนทำงาน
1. วิเคราะห์โปรเจกต์ก่อน
2. สรุปแผน
3. ค่อยแก้โค้ด
4. บอกรายชื่อไฟล์ที่แก้หลังเสร็จ

## Patch Review v2.1 (บังคับ)

หลังแก้โค้ดทุกครั้ง ต้องทำตามขั้นตอนนี้

1. Issue Summary
2. Changed Files
3. Impact
4. Risk
5. Patch Preview
6. รอคำว่า "อนุมัติ" ก่อนแก้จริง

### 7. Verification (บังคับ)

หลังแก้เสร็จ ต้องรัน

```bash
npx tsc --noEmit
```

แล้วสรุปแยกเป็น

* Errors ในไฟล์ที่แก้
* Existing Errors ของโปรเจกต์

### 8. Rollback Note

ระบุว่า หากต้องย้อนกลับ ต้องย้อนเฉพาะไฟล์ใด (เช่น DashboardScreen.tsx)
