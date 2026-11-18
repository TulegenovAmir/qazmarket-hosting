-- Demo customers' addresses, orders in different statuses, a review and a ticket.
-- Customers 1 and 2 are inserted by setup.js (passwords are hashed there).

INSERT INTO addresses (customer_id, city, street, apartment, is_default) VALUES
 (1, 'Almaty', 'Abay ave. 10',      '25', TRUE),
 (2, 'Almaty', 'Tole bi st. 59',    '7',  TRUE);

-- order_id, customer, address, status, days ago
INSERT INTO orders (customer_id, address_id, order_date, status, total_amount) VALUES
 (1, 1, NOW() - INTERVAL '12 days', 'delivered', 0),
 (2, 2, NOW() - INTERVAL '9 days',  'delivered', 0),
 (1, 1, NOW() - INTERVAL '1 day',   'paid',      0),
 (2, 2, NOW() - INTERVAL '2 days',  'packed',    0),
 (2, 2, NOW() - INTERVAL '3 days',  'shipped',   0);

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT v.order_id, v.product_id, v.qty, p.price
FROM (VALUES (1, 1, 1), (1, 3, 1), (2, 10, 2), (3, 3, 1), (4, 9, 1), (5, 6, 1))
     AS v(order_id, product_id, qty)
JOIN products p ON p.product_id = v.product_id;

UPDATE orders o SET total_amount = t.total
FROM (SELECT order_id, SUM(quantity * unit_price) AS total FROM order_items GROUP BY order_id) t
WHERE t.order_id = o.order_id;

INSERT INTO payments (order_id, method, amount, status, provider_ref, paid_at)
SELECT order_id,
       CASE WHEN order_id = 2 THEN 'qr' ELSE 'card' END,
       total_amount, 'success', 'PAY-DEMO-' || order_id, order_date + INTERVAL '1 minute'
FROM orders;

-- open orders keep their items reserved (not yet left the warehouse)
UPDATE inventory i SET qty_reserved = r.qty
FROM (SELECT oi.product_id, SUM(oi.quantity) AS qty
        FROM order_items oi JOIN orders o USING (order_id)
       WHERE o.status IN ('new', 'paid', 'packed', 'shipped')
       GROUP BY oi.product_id) r
WHERE r.product_id = i.product_id;

INSERT INTO deliveries (order_id, partner_id, tracking_number, status, shipped_at, delivered_at) VALUES
 (1, 1, 'QZ100001KZ', 'delivered',  NOW() - INTERVAL '11 days', NOW() - INTERVAL '10 days'),
 (2, 2, 'QZ100002KZ', 'delivered',  NOW() - INTERVAL '8 days',  NOW() - INTERVAL '6 days'),
 (5, 1, 'QZ100005KZ', 'in_transit', NOW() - INTERVAL '1 day',   NULL);

INSERT INTO reviews (customer_id, product_id, rating, comment) VALUES
 (1, 1, 5, 'Great phone for this price, battery lasts two days.'),
 (2, 10, 4, 'Good kettle, the app is a bit slow.');

INSERT INTO support_tickets (customer_id, order_id, assigned_to, type, status, description) VALUES
 (2, 2, 4, 'question', 'resolved', 'How do I connect the kettle to the app?'),
 (2, 5, 4, 'question', 'open',     'When will my mouse arrive?');
