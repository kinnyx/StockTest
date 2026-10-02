"use client";
import { useEffect, useState } from "react";
type Product = {
  code: string;
  name: string;
  price: number;
  onHand: number;
  reserved: number;
  available: number;
};
type Item = {
  code: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};
type Cart = { id: string; status: string; items: Item[]; total: number };
type Receipt = { orderId: string; total: number; items: Item[] };
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const money = (n: number) =>
  n.toLocaleString("th-TH", { style: "currency", currency: "THB" });
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  return data as T;
}
export default function Page() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [search, setSearch] = useState("");
  async function refresh(id: string) {
    const [p, c] = await Promise.all([
      api<Product[]>("/api/products"),
      api<Cart>(`/api/carts/${id}`),
    ]);
    setProducts(p);
    setCart(c);
  }
  async function newCart() {
    const c = await api<{ id: string }>("/api/carts", "POST");
    localStorage.setItem("stock-cart-id", c.id);
    return c.id;
  }
  async function initialize() {
    setBusy(true);
    setError("");
    try {
      const id = localStorage.getItem("stock-cart-id") ?? (await newCart());
      await refresh(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void initialize();
  }, []); // Persist cart across page refreshes.
  async function action(work: () => Promise<unknown>) {
    if (busy || !cart) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      try {
        await refresh(cart.id);
      } catch {
        setError((prev) => prev || "โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดรีเฟรช");
      }
      setBusy(false);
    }
  }
  const setQuantity = (code: string, quantity: number) =>
    action(() =>
      api(`/api/carts/${cart!.id}/items/${code}`, "PUT", { quantity }),
    );
  const checkout = () =>
    action(async () => {
      const r = await api<Receipt>(`/api/carts/${cart!.id}/checkout`, "POST");
      setReceipt(r);
    });
  const count = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  const completed = cart?.status === "completed";
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ▦ <span>STOCKROOM</span>
        </a>
        <span className="tag">STOCK & SHOP · DEMO</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">YOUR EVERYDAY WORKSPACE</p>
          <h1>เลือกสินค้า พร้อมเช็กสต๊อก</h1>
          <p>จัดการสินค้าและตะกร้าของคุณในที่เดียว</p>
        </div>
        <button disabled={busy} className="secondary" onClick={initialize}>
          ↻ รีเฟรชข้อมูล
        </button>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="stats">
        <div>
          <small>รายการสินค้า</small>
          <strong>{products.length}</strong>
        </div>
        <div>
          <small>พร้อมขายรวม</small>
          <strong>
            {products.reduce((n, p) => n + p.available, 0)} <em>ชิ้น</em>
          </strong>
        </div>
        <div>
          <small>สินค้าในตะกร้า</small>
          <strong>
            {count} <em>ชิ้น</em>
          </strong>
        </div>
      </div>
      <div className="columns">
        <section>
          <div className="section-heading">
            <h2>สินค้าทั้งหมด</h2>
            <input
              aria-label="ค้นหาสินค้า"
              placeholder="ค้นหาชื่อ / รหัสสินค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="products">
            {products
              .filter((p) =>
                (p.code + " " + p.name)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((p, index) => (
                <article className="product" key={p.code}>
                  <div className={`art art${index % 3}`}>
                    <span>
                      {["⌨", "↗", "▤", "▣", "⌁", "◉"][products.indexOf(p) % 6]}
                    </span>
                    <label className={p.available ? "" : "out"}>
                      {p.available ? `พร้อมขาย ${p.available}` : "สินค้าหมด"}
                    </label>
                  </div>
                  <div className="product-body">
                    <small>{p.code}</small>
                    <h3>{p.name}</h3>
                    <p className="stock">
                      ในคลัง {p.onHand} · กันไว้ {p.reserved}
                    </p>
                    <div className="product-footer">
                      <strong>{money(p.price)}</strong>
                      <button
                        disabled={
                          busy || !cart || completed || p.available === 0
                        }
                        onClick={() =>
                          setQuantity(
                            p.code,
                            (cart?.items.find((i) => i.code === p.code)
                              ?.quantity ?? 0) + 1,
                          )
                        }
                      >
                        + เพิ่ม
                      </button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
          {!products.length && (
            <p>
              {busy
                ? "กำลังโหลดสินค้า..."
                : "ยังไม่มีข้อมูลสินค้า กรุณาตรวจสอบ API แล้วรีเฟรช"}
            </p>
          )}
        </section>
        <aside>
          <div className="section-heading">
            <h2>
              ตะกร้าสินค้า <span className="badge">{count}</span>
            </h2>
          </div>
          {cart?.items.map((i) => (
            <div className="cart-item" key={i.code}>
              <div>
                <strong>{i.name}</strong>
                <small>
                  {i.code} · {money(i.unitPrice)} / ชิ้น
                </small>
              </div>
              <div className="item-actions">
                <div className="stepper">
                  <button
                    aria-label={`ลด ${i.name}`}
                    disabled={busy}
                    onClick={() => setQuantity(i.code, i.quantity - 1)}
                  >
                    −
                  </button>
                  <span>{i.quantity}</span>
                  <button
                    aria-label={`เพิ่ม ${i.name}`}
                    disabled={
                      busy ||
                      !products.find((p) => p.code === i.code)?.available
                    }
                    onClick={() => setQuantity(i.code, i.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <strong>{money(i.lineTotal)}</strong>
                <button
                  className="remove"
                  disabled={busy}
                  onClick={() =>
                    action(() =>
                      api(`/api/carts/${cart!.id}/items/${i.code}`, "DELETE"),
                    )
                  }
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
          {!count && (
            <div className="empty">
              <span>▱</span>
              <h3>{completed ? "ทำรายการเรียบร้อย" : "ตะกร้าของคุณยังว่าง"}</h3>
              <p>
                {completed
                  ? "ดูใบสรุปยอด หรือเริ่มซื้อครั้งใหม่"
                  : "เลือกสินค้าเพื่อเริ่มรายการสั่งซื้อ"}
              </p>
            </div>
          )}
          <div className="summary">
            <div>
              <span>ยอดที่ต้องชำระ</span>
              <strong>{money(cart?.total ?? 0)}</strong>
            </div>
            <small>ไม่มีค่าจัดส่งหรือภาษีเพิ่มเติมในตัวอย่างนี้</small>
            <button
              className="checkout"
              disabled={busy || !count}
              onClick={checkout}
            >
              {busy ? "กำลังดำเนินการ..." : "ชำระเงิน (จำลอง) →"}
            </button>
            <button
              className="clear"
              disabled={busy || !count}
              onClick={() =>
                action(() => api(`/api/carts/${cart!.id}/items`, "DELETE"))
              }
            >
              ล้างตะกร้าทั้งหมด
            </button>
            {completed && (
              <>
                <button
                  className="secondary full"
                  disabled={busy}
                  onClick={checkout}
                >
                  ดูใบสรุปยอด
                </button>
                <button
                  className="checkout"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const id = await newCart();
                      await refresh(id);
                      setReceipt(null);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "สร้างตะกร้าไม่สำเร็จ",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  เริ่มซื้อครั้งใหม่
                </button>
              </>
            )}
            <p className="note">
              สินค้าที่เพิ่มลงตะกร้าจะถูกกันสต๊อกทันที
              และคืนจำนวนพร้อมขายเมื่อลดหรือลบรายการ
            </p>
          </div>
        </aside>
      </div>
      {receipt && (
        <div className="overlay">
          <section
            className="receipt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-title"
          >
            <p className="eyebrow">ORDER CONFIRMED</p>
            <h2 id="receipt-title">ชำระเงินจำลองสำเร็จ</h2>
            <p>บันทึกคำสั่งซื้อและตัดสต๊อกเรียบร้อย</p>
            <small>เลขที่ {receipt.orderId}</small>
            {receipt.items.map((i) => (
              <div className="receipt-line" key={i.code}>
                <span>
                  {i.name} × {i.quantity}
                </span>
                <strong>{money(i.lineTotal)}</strong>
              </div>
            ))}
            <div className="receipt-total">
              <span>ยอดชำระ</span>
              <strong>{money(receipt.total)}</strong>
            </div>
            <button className="checkout" onClick={() => setReceipt(null)}>
              ปิด
            </button>
          </section>
        </div>
      )}
      <footer>STOCKROOM · Next.js + ASP.NET Core + PostgreSQL</footer>
    </main>
  );
}
