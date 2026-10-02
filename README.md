# Stockroom — ระบบ Stock และตะกร้าสินค้า

โปรเจกต์ตัวอย่างครบทั้ง Next.js (TypeScript / App Router), ASP.NET Core .NET 10 (C# / REST API), PostgreSQL และข้อมูล Mockup 6 รายการ ใช้ Npgsql และ SQL แบบ parameterized โดยตรง ไม่ได้ใช้ EF Core

## เริ่มใช้งานด้วย Docker Compose

ติดตั้ง Docker พร้อม Compose แล้วเปิด Terminal ในโฟลเดอร์ `stock-cart`:

```bash
docker compose up --build -d
```

เปิด http://localhost:3000 และตรวจ API ได้ที่ http://localhost:5000/api/products

ดู log หรือหยุดระบบ:

```bash
docker compose logs -f api web
docker compose down
```

ข้อมูลเก็บใน Docker volume; `down` ปกติไม่ลบข้อมูล ฐานข้อมูลและ Mockup จะถูกสร้างเฉพาะเมื่อ volume ว่างเท่านั้น

## รันสำหรับพัฒนาโดยไม่ใช้ Docker กับแอป

ต้องมี Node.js 22+, .NET SDK 10 และ PostgreSQL (หรือรันเฉพาะ DB ด้วยคำสั่งด้านล่าง)

```bash
docker compose up -d db
dotnet run --project backend/Stock.Api.csproj --urls http://localhost:5000
```

เปิดอีก Terminal:

```bash
cd frontend
npm install
npm run dev
```

Connection string เริ่มต้น: `Host=localhost;Port=5432;Database=stock;Username=stock;Password=stock_dev`
ปรับผ่าน `ConnectionStrings__Stock`; CORS ปรับผ่าน `FrontendOrigin` (default `http://localhost:3000`)
Frontend ปรับ API URL ด้วย `NEXT_PUBLIC_API_URL` ก่อน build (default `http://localhost:5000`)

## หลักการ Stock

- `on_hand` คือสินค้าคงเหลือจริงในคลัง
- `reserved` คือจำนวนที่กันให้ตะกร้าที่ยังไม่ชำระเงินทุกใบ
- `available = on_hand - reserved` คือจำนวนที่เพิ่มลงตะกร้าได้
- เพิ่มลงตะกร้า: เพิ่ม reserved จึงลด available โดยยังไม่ตัด on_hand
- ลด/ลบ/ล้าง: ลด reserved จึงคืน available
- ชำระเงิน: ลดทั้ง on_hand และ reserved ตามจำนวนในตะกร้า จึงไม่ตัด available ซ้ำ

ตัวอย่าง: มี 10 ชิ้น → ใส่ตะกร้า 3 ชิ้น → on_hand=10, reserved=3, available=7 → ชำระเงิน → on_hand=7, reserved=0, available=7

Backend เป็นผู้ตรวจจำนวนและคำนวณราคา ไม่เชื่อยอดเงินจาก Frontend ใช้ decimal กับ PostgreSQL numeric สำหรับเงิน
ทุก mutation ของ stock ใช้ transaction และ PostgreSQL transaction advisory lock เดียวร่วมกันทุก API instance เพื่อให้เดโมอ่านง่ายและป้องกัน overselling; ฐานข้อมูลมี CHECK constraints กำกับอีกชั้น การใช้งานขนาดใหญ่ควรเปลี่ยนเป็น row locks ที่เรียงลำดับแน่นอนเพื่อลดการรอกัน

Checkout เป็น idempotent ต่อ cart_id: การ retry หรือกดพร้อมกันคืน order เดิม ไม่ตัดสต๊อกซ้ำ เก็บชื่อ/ราคา ณ เวลาซื้อใน order_items และล้างรายการในตะกร้าเดิม สร้างตะกร้าใหม่เมื่อกดเริ่มซื้อครั้งใหม่

## REST API

| Method | Endpoint | การทำงาน |
|---|---|---|
| GET | /api/products | สินค้า ราคา และ onHand/reserved/available |
| POST | /api/carts | สร้างตะกร้า คืน `{ "id": "uuid" }` |
| GET | /api/carts/{id} | รายการและยอดรวม |
| PUT | /api/carts/{id}/items/{code} | กำหนดจำนวนรวม `{ "quantity": 2 }`; 0 คือลบ |
| DELETE | /api/carts/{id}/items/{code} | ลบรายการและคืนสต๊อก |
| DELETE | /api/carts/{id}/items | ล้างตะกร้าและคืนสต๊อก |
| POST | /api/carts/{id}/checkout | จำลองชำระเงิน ตัดสต๊อก คืนใบสรุปยอด |

Error ใช้ `{ "message": "..." }`; 400 = input ไม่ถูกต้อง/ตะกร้าว่าง, 404 = ไม่พบ, 409 = สต๊อกไม่พอ/ตะกร้าชำระแล้ว

## ทดสอบ

สคริปต์นี้เปลี่ยนข้อมูลจริงในฐานข้อมูลเดโม ให้ใช้ฐานข้อมูลทดลองที่เพิ่ง seed และไม่มีผู้ใช้อื่นแก้ไขระหว่างทดสอบ:

```bash
python3 tests/integration.py
```

บน Windows ใช้ `python tests/integration.py` ได้

ครอบคลุมเพิ่ม/ลด/ลบ/ล้าง, เกิน stock, จำนวนติดลบ, สินค้าหมด, สินค้าไม่มีอยู่, ตะกร้าว่าง, ตะกร้าสองใบแย่งสินค้าพร้อมกัน, checkout ซ้ำ/พร้อมกัน, ยอดเงิน และการตัดสต๊อกครั้งเดียว

หากต้องการเริ่มฐานข้อมูลใหม่ คำสั่งต่อไปนี้ **ลบข้อมูลเดโมทั้งหมดและคำสั่งซื้อทั้งหมด**:

```bash
docker compose down -v
docker compose up --build -d
```

ตรวจ Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

## ขอบเขตของตัวอย่าง

- การชำระเงินเป็น simulation ไม่มีการเรียกเก็บเงินจริง
- ไม่มี Login/สิทธิ์เข้าถึง; UUID ตะกร้าเก็บใน localStorage และ API เข้าถึงได้โดยผู้ที่รู้ ID เหมาะสำหรับการทดลองในเครื่องเท่านั้น
- ไม่มีเวลาหมดอายุของการกันสินค้า: ปิด browser แล้วยังคงกันสินค้า ต้องกลับมาล้างตะกร้าหรือชำระเงิน หากใช้จริงควรเพิ่ม expiry และงานคืนสต๊อก
- สต๊อกบนหน้าจอโหลดเมื่อเปิดหน้า กดรีเฟรช หรือทำรายการ ไม่ใช่ real-time; API จะตรวจ stock ล่าสุดเสมอ
- ไม่มีหน้าจอเติมสินค้า/จัดการสินค้า เนื่องจากโจทย์กำหนดให้ใช้ Mockup
- ราคาและยอดชำระไม่มีค่าจัดส่ง/ภาษีเพิ่มเติม
- Compose bind port เฉพาะ localhost และรหัสผ่านที่ให้เป็นรหัสสำหรับ development

## โครงสร้าง

`frontend/app/page.tsx` หน้าแสดงสินค้าและตะกร้า; `backend/Program.cs` endpoints และ transaction; `database/init.sql` schema และ seed; `tests/integration.py` API integration test

## เอกสารอ้างอิง

- https://nextjs.org/docs/app/getting-started/installation
- https://www.npgsql.org/doc/basic-usage.html

สถานะการตรวจในสภาพแวดล้อมที่สร้างไฟล์: ดู `VALIDATION.md` ซึ่งบันทึกสิ่งที่รันจริงและข้อจำกัด ไม่ถือว่าสคริปต์ทดสอบผ่านจนกว่าจะรันกับ API และ PostgreSQL จริง
