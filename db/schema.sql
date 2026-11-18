

DROP TABLE IF EXISTS support_tickets, reviews, deliveries, delivery_partners, payments, order_items, orders, purchase_orders, inventory, products, suppliers, categories, employees, addresses, customers CASCADE;

CREATE TABLE customers (
    customer_id     SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(120) NOT NULL UNIQUE,
    phone           VARCHAR(20)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE addresses (
    address_id      SERIAL PRIMARY KEY,
    customer_id     INT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    city            VARCHAR(60)  NOT NULL,
    street          VARCHAR(120) NOT NULL,
    apartment       VARCHAR(20),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE
);


CREATE TABLE employees (
    employee_id     SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(120) NOT NULL UNIQUE,
    role            VARCHAR(30)  NOT NULL
        CHECK (role IN ('admin','sales_manager','warehouse','support','finance'))
);


CREATE TABLE categories (
    category_id     SERIAL PRIMARY KEY,
    name            VARCHAR(60) NOT NULL UNIQUE,
    parent_id       INT REFERENCES categories(category_id)
);

CREATE TABLE suppliers (
    supplier_id     SERIAL PRIMARY KEY,
    company_name    VARCHAR(120) NOT NULL,
    contact_name    VARCHAR(100),
    phone           VARCHAR(20),
    email           VARCHAR(120),
    lead_time_days  INT NOT NULL DEFAULT 7 CHECK (lead_time_days > 0)
);

CREATE TABLE products (
    product_id      SERIAL PRIMARY KEY,
    category_id     INT NOT NULL REFERENCES categories(category_id),
    supplier_id     INT NOT NULL REFERENCES suppliers(supplier_id),
    sku             VARCHAR(30)  NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL CHECK (price > 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE inventory (
    product_id      INT PRIMARY KEY REFERENCES products(product_id),
    qty_on_hand     INT NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
    qty_reserved    INT NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
    reorder_level   INT NOT NULL DEFAULT 5,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (qty_reserved <= qty_on_hand)
);

CREATE TABLE purchase_orders (
    po_id           SERIAL PRIMARY KEY,
    supplier_id     INT NOT NULL REFERENCES suppliers(supplier_id),
    product_id      INT NOT NULL REFERENCES products(product_id),
    quantity        INT NOT NULL CHECK (quantity > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'ordered'
        CHECK (status IN ('ordered','shipped','received','cancelled')),
    ordered_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_at     DATE
);


CREATE TABLE orders (
    order_id        SERIAL PRIMARY KEY,
    customer_id     INT NOT NULL REFERENCES customers(customer_id),
    address_id      INT NOT NULL REFERENCES addresses(address_id),
    order_date      TIMESTAMP NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','paid','packed','shipped','delivered','cancelled','returned')),
    total_amount    NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0)
);

CREATE TABLE order_items (
    order_id        INT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id      INT NOT NULL REFERENCES products(product_id),
    quantity        INT NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
    PRIMARY KEY (order_id, product_id)
);


CREATE TABLE payments (
    payment_id      SERIAL PRIMARY KEY,
    order_id        INT NOT NULL UNIQUE REFERENCES orders(order_id),
    method          VARCHAR(20) NOT NULL CHECK (method IN ('card','qr','cash_on_delivery')),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','success','failed','refunded')),
    provider_ref    VARCHAR(60),
    paid_at         TIMESTAMP
);


CREATE TABLE delivery_partners (
    partner_id      SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),
    avg_days        INT NOT NULL DEFAULT 2
);

CREATE TABLE deliveries (
    delivery_id     SERIAL PRIMARY KEY,
    order_id        INT NOT NULL UNIQUE REFERENCES orders(order_id),
    partner_id      INT NOT NULL REFERENCES delivery_partners(partner_id),
    tracking_number VARCHAR(40) UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting','picked_up','in_transit','delivered','failed')),
    shipped_at      TIMESTAMP,
    delivered_at    TIMESTAMP
);


CREATE TABLE reviews (
    review_id       SERIAL PRIMARY KEY,
    customer_id     INT NOT NULL REFERENCES customers(customer_id),
    product_id      INT NOT NULL REFERENCES products(product_id),
    rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

CREATE TABLE support_tickets (
    ticket_id       SERIAL PRIMARY KEY,
    customer_id     INT NOT NULL REFERENCES customers(customer_id),
    order_id        INT REFERENCES orders(order_id),
    assigned_to     INT REFERENCES employees(employee_id),
    type            VARCHAR(20) NOT NULL CHECK (type IN ('question','complaint','return')),
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','in_progress','resolved','closed')),
    description     TEXT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

