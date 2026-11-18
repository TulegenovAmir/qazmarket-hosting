-- QazMarket demo data: catalog, suppliers, couriers, staff, stock

INSERT INTO categories (name) VALUES
 ('Phones'), ('Laptops'), ('Audio'), ('Home'), ('Accessories');

INSERT INTO suppliers (company_name, contact_name, phone, email, lead_time_days) VALUES
 ('TechImport KZ',   'Serik Abenov',   '+77272500101', 'sales@techimport.kz', 7),
 ('Asia Electronics','Li Wei',         '+77272500202', 'order@asiaelec.kz',  10),
 ('HomeGoods Almaty','Dana Karimova',  '+77272500303', 'hello@homegoods.kz',  3);

INSERT INTO delivery_partners (name, phone, avg_days) VALUES
 ('FastCourier Almaty', '+77001112233', 1),
 ('KazPost Express',    '+77003334455', 3);

INSERT INTO employees (full_name, email, role) VALUES
 ('Aigerim Nurlanova', 'admin@qazmarket.kz',     'admin'),
 ('Timur Bekov',       'sales@qazmarket.kz',     'sales_manager'),
 ('Ruslan Akhmetov',   'warehouse@qazmarket.kz', 'warehouse'),
 ('Madina Seitkali',   'support@qazmarket.kz',   'support'),
 ('Olga Kim',          'finance@qazmarket.kz',   'finance');

INSERT INTO products (category_id, supplier_id, sku, name, description, price) VALUES
 (1, 1, 'PH-NOVA-A5',  'Smartphone Nova A5',      '6.5" screen, 128 GB, dual camera, 5000 mAh battery.', 129990),
 (1, 1, 'PH-NOVA-XP',  'Smartphone Nova X Pro',   '6.7" OLED, 256 GB, triple camera, fast charging.',   349990),
 (1, 2, 'PH-CASE-SIL', 'Silicone Phone Case',     'Soft-touch case for Nova A5 and X Pro.',             4990),
 (2, 2, 'LP-AIR-13',   'Laptop Air 13',           '13.3" light laptop, 16 GB RAM, 512 GB SSD.',         389000),
 (2, 2, 'LP-WORK-15',  'Laptop Work 15',          '15.6" laptop for study and office, 8 GB RAM.',       259000),
 (2, 2, 'LP-MOUSE-W',  'Wireless Mouse',          'Silent clicks, 12 months on one battery.',           7990),
 (3, 2, 'AU-BUDS',     'Wireless Earbuds',        'Noise cancelling, 24 h with case.',                  24500),
 (3, 2, 'AU-SPEAK',    'Bluetooth Speaker',       'Waterproof IPX7 speaker, 12 h playback.',            32900),
 (3, 1, 'AU-STUDIO',   'Headphones Studio',       'Over-ear headphones with deep bass.',                59900),
 (4, 3, 'HM-KETTLE',   'Smart Kettle',            '1.7 L kettle, keeps water warm, app control.',       18900),
 (4, 3, 'HM-ROBOT',    'Robot Vacuum',            'Vacuum and mop, maps your apartment.',               149000),
 (4, 3, 'HM-AIR',      'Air Purifier',            'HEPA filter for rooms up to 40 m2.',                 89900),
 (5, 1, 'AC-POWER-20', 'Power Bank 20000 mAh',    'Charges a phone 4 times, USB-C PD.',                 14900),
 (5, 1, 'AC-CHG-65',   'USB-C Charger 65W',       'Charges laptop and phone together.',                 11900),
 (5, 2, 'AC-WATCH',    'Smart Watch Fit',         'Steps, sleep and heart-rate tracking.',              45900),
 (5, 1, 'AC-HDMI-2',   'HDMI Cable 2 m',          '4K HDMI 2.1 cable.',                                 3500);

INSERT INTO inventory (product_id, qty_on_hand, qty_reserved, reorder_level) VALUES
 (1, 14, 0, 5), (2, 6, 0, 3), (3, 40, 0, 10), (4, 3, 0, 5),
 (5, 8, 0, 3), (6, 25, 0, 8), (7, 0, 0, 5), (8, 12, 0, 4),
 (9, 4, 0, 5), (10, 27, 0, 6), (11, 5, 0, 2), (12, 9, 0, 3),
 (13, 30, 0, 8), (14, 20, 0, 6), (15, 2, 0, 4), (16, 50, 0, 10);

-- one purchase order already on the way (Wireless Earbuds are out of stock)
INSERT INTO purchase_orders (supplier_id, product_id, quantity, status, ordered_at, expected_at) VALUES
 (2, 7, 30, 'shipped', CURRENT_DATE - 5, CURRENT_DATE + 5);
