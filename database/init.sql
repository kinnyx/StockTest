CREATE TABLE products (
 code varchar(30) PRIMARY KEY, name text NOT NULL,
 price numeric(12,2) NOT NULL CHECK(price >= 0)
);
CREATE TABLE stocks (
 product_code varchar(30) PRIMARY KEY REFERENCES products(code),
 on_hand integer NOT NULL CHECK(on_hand >= 0),
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand)
);
CREATE TABLE carts (id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')));
CREATE TABLE cart_items (
 cart_id uuid REFERENCES carts(id), product_code varchar(30) REFERENCES products(code),
 quantity integer NOT NULL CHECK(quantity > 0), PRIMARY KEY(cart_id, product_code)
);
CREATE TABLE orders (
 id uuid PRIMARY KEY, cart_id uuid NOT NULL UNIQUE REFERENCES carts(id),
 total numeric(14,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_items (
 order_id uuid REFERENCES orders(id), product_code varchar(30) NOT NULL,
 name text NOT NULL, unit_price numeric(12,2) NOT NULL, quantity integer NOT NULL CHECK(quantity > 0),
 PRIMARY KEY(order_id, product_code)
);
INSERT INTO products VALUES
 ('P001','Mechanical Keyboard',1590),('P002','Wireless Mouse',690),
 ('P003','USB-C Hub',1290),('P004','Monitor 27 inch',5990),
 ('P005','Laptop Stand',890),('P006','Webcam Full HD',1490);
INSERT INTO stocks(product_code,on_hand) VALUES ('P001',10),('P002',5),('P003',3),('P004',2),('P005',8),('P006',0);
