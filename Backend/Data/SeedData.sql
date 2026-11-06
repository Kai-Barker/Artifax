-- =====================================================================
-- Artifax demo seed data: industrial manufacturing company
-- Run once against a freshly migrated database (dotnet ef database update).
-- Everything runs in one transaction and aborts if items already exist.
--
-- Demo staff password (all seeded employees): Artifax@2026
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Items") THEN
        RAISE EXCEPTION 'Seed aborted: "Items" already has rows. This script is for an empty database.';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Branches (factory sites). Keeps an existing "Main Branch" if present.
-- ---------------------------------------------------------------------
INSERT INTO "Branches" ("BranchName")
SELECT v.name
FROM (VALUES
    ('Main Branch'),
    ('Johannesburg Fabrication Plant'),
    ('Durban Assembly Plant'),
    ('Cape Town Components Plant')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM "Branches" b WHERE b."BranchName" = v.name);

-- ---------------------------------------------------------------------
-- Items: raw materials + manufactured products
-- ProductionTime is minutes per unit. Price is per unit (ZAR).
-- Categories match the frontend's inventory tabs.
-- ---------------------------------------------------------------------
INSERT INTO "Items" ("ItemName", "ItemCategory", "ProductionTime", "Price") VALUES
    -- Metals
    ('Steel Sheet 2mm',                 'Metals',      3,   450.00),
    ('Aluminium Extrusion 40x40',       'Metals',      2,   220.00),
    ('Stainless Steel Tube 25mm',       'Metals',      2,   310.00),
    ('Copper Busbar 30x5',              'Metals',      3,   680.00),
    ('Steel Angle Iron 50mm',           'Metals',      2,   180.00),
    -- Fasteners
    ('Hex Bolt M10',                    'Fasteners',   1,     2.50),
    ('Hex Nut M10',                     'Fasteners',   1,     0.80),
    ('Self-Tapping Screw 4.2mm',        'Fasteners',   1,     0.35),
    ('Pop Rivet 4mm',                   'Fasteners',   1,     0.25),
    ('Spring Washer M10',               'Fasteners',   1,     0.40),
    -- Plastic
    ('ABS Pellets 25kg',                'Plastic',     2,   950.00),
    ('Polycarbonate Sheet 6mm',         'Plastic',     3,  1250.00),
    ('Nylon Bushing 20mm',              'Plastic',     1,    12.00),
    ('PVC Cable Conduit 20mm',          'Plastic',     1,    35.00),
    -- Electronics
    ('PLC Controller Module',           'Electronics', 10, 6800.00),
    ('Inductive Proximity Sensor',      'Electronics', 4,   540.00),
    ('Contactor 3-Phase 25A',           'Electronics', 5,   820.00),
    ('Industrial Cable 4mm2 100m',      'Electronics', 3,  1450.00),
    ('Electric Motor 1.5kW',            'Electronics', 15, 4200.00),
    ('Emergency Stop Button',           'Electronics', 2,   260.00),
    -- Textile
    ('PVC Conveyor Belting (per m)',    'Textile',     4,   380.00),
    ('Kevlar Safety Fabric (per m)',    'Textile',     3,   720.00),
    ('Polyester Lifting Webbing 50mm',  'Textile',     2,    45.00),
    -- Glass
    ('Tempered Glass Panel 600x400',    'Glass',       6,   890.00),
    ('Laminated Safety Glass 8mm',      'Glass',       8,  1350.00),
    -- Others
    ('Industrial Lubricant 5L',         'Others',      1,   410.00),
    ('Powder Coat Paint 20kg',          'Others',      2,  1800.00),
    ('Rubber Gasket Strip 10m',         'Others',      1,   160.00),
    ('MIG Welding Wire 15kg',           'Others',      1,   990.00),
    -- Manufactured products
    ('Steel Workbench 1800mm',          'Furniture',   45,  8900.00),
    ('Heavy-Duty Tool Cabinet',         'Furniture',   60, 12500.00),
    ('Electrical Control Panel',        'Electronics', 120, 38500.00),
    ('Conveyor Section 2m',             'Metals',      90, 24800.00),
    ('Machine Safety Guard',            'Glass',       40,  6400.00),
    ('Safety Inspection Window',        'Glass',       35,  4900.00),
    ('Industrial Extraction Fan',       'Electronics', 75, 15200.00),
    ('Pallet Rack Frame',               'Metals',      50,  7300.00),
    ('Lifting Sling Assembly',          'Textile',     20,  1650.00),
    ('Copper Busbar Distribution Kit',  'Electronics', 30,  5200.00);

-- ---------------------------------------------------------------------
-- Blueprints (ItemIngredients): what each product is built from
-- ---------------------------------------------------------------------
INSERT INTO "ItemIngredients" ("ProductID", "IngredientID", "IngredientQuantity")
SELECT p."ItemID", i."ItemID", v.qty
FROM (VALUES
    ('Steel Workbench 1800mm',         'Steel Sheet 2mm',               2),
    ('Steel Workbench 1800mm',         'Steel Angle Iron 50mm',         6),
    ('Steel Workbench 1800mm',         'Hex Bolt M10',                  16),
    ('Steel Workbench 1800mm',         'Hex Nut M10',                   16),
    ('Steel Workbench 1800mm',         'Powder Coat Paint 20kg',        1),

    ('Heavy-Duty Tool Cabinet',        'Steel Sheet 2mm',               4),
    ('Heavy-Duty Tool Cabinet',        'Self-Tapping Screw 4.2mm',      40),
    ('Heavy-Duty Tool Cabinet',        'Nylon Bushing 20mm',            8),
    ('Heavy-Duty Tool Cabinet',        'Powder Coat Paint 20kg',        1),
    ('Heavy-Duty Tool Cabinet',        'Rubber Gasket Strip 10m',       1),

    ('Electrical Control Panel',       'Steel Sheet 2mm',               2),
    ('Electrical Control Panel',       'PLC Controller Module',         1),
    ('Electrical Control Panel',       'Contactor 3-Phase 25A',         3),
    ('Electrical Control Panel',       'Industrial Cable 4mm2 100m',    1),
    ('Electrical Control Panel',       'Emergency Stop Button',         1),
    ('Electrical Control Panel',       'PVC Cable Conduit 20mm',        4),
    ('Electrical Control Panel',       'Self-Tapping Screw 4.2mm',      24),

    ('Conveyor Section 2m',            'Aluminium Extrusion 40x40',     6),
    ('Conveyor Section 2m',            'PVC Conveyor Belting (per m)',  4),
    ('Conveyor Section 2m',            'Electric Motor 1.5kW',          1),
    ('Conveyor Section 2m',            'Inductive Proximity Sensor',    2),
    ('Conveyor Section 2m',            'Hex Bolt M10',                  24),
    ('Conveyor Section 2m',            'Hex Nut M10',                   24),
    ('Conveyor Section 2m',            'Industrial Lubricant 5L',       1),

    ('Machine Safety Guard',           'Aluminium Extrusion 40x40',     4),
    ('Machine Safety Guard',           'Polycarbonate Sheet 6mm',       2),
    ('Machine Safety Guard',           'Pop Rivet 4mm',                 30),
    ('Machine Safety Guard',           'Rubber Gasket Strip 10m',       1),

    ('Safety Inspection Window',       'Tempered Glass Panel 600x400',  1),
    ('Safety Inspection Window',       'Stainless Steel Tube 25mm',     2),
    ('Safety Inspection Window',       'Rubber Gasket Strip 10m',       1),
    ('Safety Inspection Window',       'Self-Tapping Screw 4.2mm',      12),

    ('Industrial Extraction Fan',      'Electric Motor 1.5kW',          1),
    ('Industrial Extraction Fan',      'Steel Sheet 2mm',               2),
    ('Industrial Extraction Fan',      'Stainless Steel Tube 25mm',     2),
    ('Industrial Extraction Fan',      'Contactor 3-Phase 25A',         1),
    ('Industrial Extraction Fan',      'Hex Bolt M10',                  8),
    ('Industrial Extraction Fan',      'Spring Washer M10',             8),

    ('Pallet Rack Frame',              'Steel Angle Iron 50mm',         8),
    ('Pallet Rack Frame',              'MIG Welding Wire 15kg',         1),
    ('Pallet Rack Frame',              'Hex Bolt M10',                  12),
    ('Pallet Rack Frame',              'Powder Coat Paint 20kg',        1),

    ('Lifting Sling Assembly',         'Polyester Lifting Webbing 50mm', 4),
    ('Lifting Sling Assembly',         'Kevlar Safety Fabric (per m)',  1),
    ('Lifting Sling Assembly',         'Pop Rivet 4mm',                 10),

    ('Copper Busbar Distribution Kit', 'Copper Busbar 30x5',            3),
    ('Copper Busbar Distribution Kit', 'Nylon Bushing 20mm',            6),
    ('Copper Busbar Distribution Kit', 'Hex Bolt M10',                  6),
    ('Copper Busbar Distribution Kit', 'Spring Washer M10',             6)
) AS v(product, ingredient, qty)
JOIN "Items" p ON p."ItemName" = v.product
JOIN "Items" i ON i."ItemName" = v.ingredient;

-- ---------------------------------------------------------------------
-- Stock per site (BranchItemCapacities). Quantities <= 5 show as LOW.
-- ---------------------------------------------------------------------
INSERT INTO "BranchItemCapacities" ("BranchID", "ItemID", "ItemQuantity")
SELECT b."BranchID", i."ItemID", v.qty
FROM (VALUES
    -- Main Branch: general stores + finished goods warehouse
    ('Main Branch', 'Steel Sheet 2mm',                 140),
    ('Main Branch', 'Steel Angle Iron 50mm',           220),
    ('Main Branch', 'Hex Bolt M10',                    4800),
    ('Main Branch', 'Hex Nut M10',                     5200),
    ('Main Branch', 'Self-Tapping Screw 4.2mm',        9500),
    ('Main Branch', 'Spring Washer M10',               3100),
    ('Main Branch', 'Powder Coat Paint 20kg',          18),
    ('Main Branch', 'Industrial Lubricant 5L',         36),
    ('Main Branch', 'Electric Motor 1.5kW',            5),
    ('Main Branch', 'Rubber Gasket Strip 10m',         64),
    ('Main Branch', 'Steel Workbench 1800mm',          14),
    ('Main Branch', 'Heavy-Duty Tool Cabinet',         9),
    ('Main Branch', 'Pallet Rack Frame',               22),
    ('Main Branch', 'Lifting Sling Assembly',          3),

    -- Johannesburg: heavy metal fabrication
    ('Johannesburg Fabrication Plant', 'Steel Sheet 2mm',            310),
    ('Johannesburg Fabrication Plant', 'Steel Angle Iron 50mm',      480),
    ('Johannesburg Fabrication Plant', 'Stainless Steel Tube 25mm',  160),
    ('Johannesburg Fabrication Plant', 'Aluminium Extrusion 40x40',  240),
    ('Johannesburg Fabrication Plant', 'MIG Welding Wire 15kg',      4),
    ('Johannesburg Fabrication Plant', 'Hex Bolt M10',               6200),
    ('Johannesburg Fabrication Plant', 'Hex Nut M10',                6000),
    ('Johannesburg Fabrication Plant', 'Powder Coat Paint 20kg',     27),
    ('Johannesburg Fabrication Plant', 'Electric Motor 1.5kW',       12),
    ('Johannesburg Fabrication Plant', 'PVC Conveyor Belting (per m)', 85),
    ('Johannesburg Fabrication Plant', 'Inductive Proximity Sensor', 40),
    ('Johannesburg Fabrication Plant', 'Industrial Lubricant 5L',    20),
    ('Johannesburg Fabrication Plant', 'Conveyor Section 2m',        6),
    ('Johannesburg Fabrication Plant', 'Pallet Rack Frame',          31),
    ('Johannesburg Fabrication Plant', 'Steel Workbench 1800mm',     8),
    ('Johannesburg Fabrication Plant', 'Industrial Extraction Fan',  2),

    -- Durban: electrical + panel assembly
    ('Durban Assembly Plant', 'PLC Controller Module',       3),
    ('Durban Assembly Plant', 'Contactor 3-Phase 25A',       48),
    ('Durban Assembly Plant', 'Industrial Cable 4mm2 100m',  26),
    ('Durban Assembly Plant', 'Emergency Stop Button',       4),
    ('Durban Assembly Plant', 'PVC Cable Conduit 20mm',      350),
    ('Durban Assembly Plant', 'Copper Busbar 30x5',          90),
    ('Durban Assembly Plant', 'Nylon Bushing 20mm',          640),
    ('Durban Assembly Plant', 'Steel Sheet 2mm',             75),
    ('Durban Assembly Plant', 'Self-Tapping Screw 4.2mm',    7200),
    ('Durban Assembly Plant', 'Spring Washer M10',           1800),
    ('Durban Assembly Plant', 'Hex Bolt M10',                2400),
    ('Durban Assembly Plant', 'Electric Motor 1.5kW',        9),
    ('Durban Assembly Plant', 'Electrical Control Panel',    5),
    ('Durban Assembly Plant', 'Copper Busbar Distribution Kit', 17),
    ('Durban Assembly Plant', 'Industrial Extraction Fan',   7),

    -- Cape Town: plastics, glass + safety components
    ('Cape Town Components Plant', 'ABS Pellets 25kg',               60),
    ('Cape Town Components Plant', 'Polycarbonate Sheet 6mm',        44),
    ('Cape Town Components Plant', 'Tempered Glass Panel 600x400',   38),
    ('Cape Town Components Plant', 'Laminated Safety Glass 8mm',     2),
    ('Cape Town Components Plant', 'Aluminium Extrusion 40x40',      130),
    ('Cape Town Components Plant', 'Stainless Steel Tube 25mm',      95),
    ('Cape Town Components Plant', 'Pop Rivet 4mm',                  12000),
    ('Cape Town Components Plant', 'Rubber Gasket Strip 10m',        52),
    ('Cape Town Components Plant', 'Self-Tapping Screw 4.2mm',       4100),
    ('Cape Town Components Plant', 'Kevlar Safety Fabric (per m)',   70),
    ('Cape Town Components Plant', 'Polyester Lifting Webbing 50mm', 410),
    ('Cape Town Components Plant', 'Machine Safety Guard',           19),
    ('Cape Town Components Plant', 'Safety Inspection Window',       11),
    ('Cape Town Components Plant', 'Lifting Sling Assembly',         26),

    -- Shortages repeated across sites (shows the same item LOW in several branches)
    ('Main Branch',                    'Emergency Stop Button',        2),
    ('Johannesburg Fabrication Plant', 'Emergency Stop Button',        3),
    ('Cape Town Components Plant',     'Emergency Stop Button',        1),
    ('Johannesburg Fabrication Plant', 'PLC Controller Module',        2),
    ('Main Branch',                    'PLC Controller Module',        1),
    ('Durban Assembly Plant',          'Laminated Safety Glass 8mm',   3),
    ('Main Branch',                    'MIG Welding Wire 15kg',        3),
    ('Cape Town Components Plant',     'MIG Welding Wire 15kg',        5),
    ('Cape Town Components Plant',     'Electric Motor 1.5kW',         4),
    ('Main Branch',                    'Industrial Extraction Fan',    1),
    ('Durban Assembly Plant',          'Lifting Sling Assembly',       2)
) AS v(branch, item, qty)
JOIN "Branches" b ON b."BranchName" = v.branch
JOIN "Items" i ON i."ItemName" = v.item;

-- ---------------------------------------------------------------------
-- Employees (password for all: Artifax@2026, bcrypt via pgcrypto)
-- ---------------------------------------------------------------------
INSERT INTO "Employees" ("EmployeeEmail", "EmployeeName", "EmployeePasswordHash", "BranchId", "EmployeeLevel")
SELECT v.email, v.name, crypt('Artifax@2026', gen_salt('bf', 11)), b."BranchID", v.level
FROM (VALUES
    ('naledi.dlamini@artifax.demo',   'Naledi Dlamini',     'Main Branch',                    'Employee'),
    ('ruan.botha@artifax.demo',       'Ruan Botha',         'Main Branch',                    'Employee'),
    ('thandi.mokoena@artifax.demo',   'Thandi Mokoena',     'Johannesburg Fabrication Plant', 'Admin'),
    ('pieter.vdmerwe@artifax.demo',   'Pieter van der Merwe','Johannesburg Fabrication Plant','Employee'),
    ('sipho.ndlovu@artifax.demo',     'Sipho Ndlovu',       'Durban Assembly Plant',          'Admin'),
    ('ayesha.patel@artifax.demo',     'Ayesha Patel',       'Durban Assembly Plant',          'Employee'),
    ('lerato.khumalo@artifax.demo',   'Lerato Khumalo',     'Cape Town Components Plant',     'Employee'),
    ('daniel.fourie@artifax.demo',    'Daniel Fourie',      'Cape Town Components Plant',     'Employee')
) AS v(email, name, branch, level)
JOIN "Branches" b ON b."BranchName" = v.branch
WHERE NOT EXISTS (SELECT 1 FROM "Employees" e WHERE e."EmployeeEmail" = v.email);

-- ---------------------------------------------------------------------
-- Production orders
--   hours_ago: when the order was created
--   progress:  fraction of TotalTime elapsed (Active / Paused only)
-- At most 3 Active per site, matching the backend's scheduler rule.
-- With the backend running, Active orders tick forward every minute,
-- complete, add stock, and Queued orders get promoted automatically.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE seed_orders ON COMMIT DROP AS
SELECT
    b."BranchID"                                  AS branch_id,
    i."ItemID"                                    AS item_id,
    e."EmployeeId"                                AS employee_id,
    v.qty,
    v.status,
    v.expedite,
    v.qty * i."ProductionTime"                    AS total_time,
    now() - make_interval(hours => v.hours_ago)   AS created_at,
    v.progress
FROM (VALUES
    -- Completed history spread over the last ~5 weeks
    ('Main Branch',                    'Steel Workbench 1800mm',         'naledi.dlamini@artifax.demo',  6, 'Complete', false, 820, 0.0),
    ('Main Branch',                    'Heavy-Duty Tool Cabinet',        'ruan.botha@artifax.demo',      4, 'Complete', false, 700, 0.0),
    ('Main Branch',                    'Pallet Rack Frame',              'naledi.dlamini@artifax.demo', 10, 'Complete', true,  510, 0.0),
    ('Main Branch',                    'Lifting Sling Assembly',         'ruan.botha@artifax.demo',     12, 'Complete', false, 260, 0.0),
    ('Main Branch',                    'Steel Workbench 1800mm',         'ruan.botha@artifax.demo',      5, 'Complete', false, 96,  0.0),
    ('Johannesburg Fabrication Plant', 'Conveyor Section 2m',            'thandi.mokoena@artifax.demo',  3, 'Complete', true,  790, 0.0),
    ('Johannesburg Fabrication Plant', 'Pallet Rack Frame',              'pieter.vdmerwe@artifax.demo', 15, 'Complete', false, 620, 0.0),
    ('Johannesburg Fabrication Plant', 'Steel Workbench 1800mm',         'pieter.vdmerwe@artifax.demo',  8, 'Complete', false, 430, 0.0),
    ('Johannesburg Fabrication Plant', 'Industrial Extraction Fan',      'thandi.mokoena@artifax.demo',  4, 'Complete', false, 300, 0.0),
    ('Johannesburg Fabrication Plant', 'Conveyor Section 2m',            'pieter.vdmerwe@artifax.demo',  2, 'Complete', false, 140, 0.0),
    ('Durban Assembly Plant',          'Electrical Control Panel',       'sipho.ndlovu@artifax.demo',    3, 'Complete', true,  760, 0.0),
    ('Durban Assembly Plant',          'Copper Busbar Distribution Kit', 'ayesha.patel@artifax.demo',   10, 'Complete', false, 560, 0.0),
    ('Durban Assembly Plant',          'Industrial Extraction Fan',      'ayesha.patel@artifax.demo',    5, 'Complete', false, 380, 0.0),
    ('Durban Assembly Plant',          'Electrical Control Panel',       'ayesha.patel@artifax.demo',    2, 'Complete', false, 190, 0.0),
    ('Cape Town Components Plant',     'Machine Safety Guard',           'lerato.khumalo@artifax.demo', 10, 'Complete', false, 840, 0.0),
    ('Cape Town Components Plant',     'Safety Inspection Window',       'daniel.fourie@artifax.demo',   8, 'Complete', false, 600, 0.0),
    ('Cape Town Components Plant',     'Lifting Sling Assembly',         'lerato.khumalo@artifax.demo', 20, 'Complete', true,  410, 0.0),
    ('Cape Town Components Plant',     'Machine Safety Guard',           'daniel.fourie@artifax.demo',   6, 'Complete', false, 220, 0.0),
    ('Cape Town Components Plant',     'Safety Inspection Window',       'lerato.khumalo@artifax.demo',  5, 'Complete', false, 75,  0.0),

    -- Currently in production (some close to finishing for a live demo)
    ('Main Branch',                    'Heavy-Duty Tool Cabinet',        'naledi.dlamini@artifax.demo',  2, 'Active',   false, 5,   0.93),
    ('Main Branch',                    'Steel Workbench 1800mm',         'ruan.botha@artifax.demo',      3, 'Active',   false, 3,   0.40),
    ('Johannesburg Fabrication Plant', 'Pallet Rack Frame',              'pieter.vdmerwe@artifax.demo',  4, 'Active',   true,  4,   0.96),
    ('Johannesburg Fabrication Plant', 'Conveyor Section 2m',            'thandi.mokoena@artifax.demo',  2, 'Active',   false, 6,   0.55),
    ('Johannesburg Fabrication Plant', 'Industrial Extraction Fan',      'pieter.vdmerwe@artifax.demo',  3, 'Active',   false, 2,   0.15),
    ('Durban Assembly Plant',          'Electrical Control Panel',       'sipho.ndlovu@artifax.demo',    1, 'Active',   true,  3,   0.90),
    ('Durban Assembly Plant',          'Copper Busbar Distribution Kit', 'ayesha.patel@artifax.demo',    6, 'Active',   false, 4,   0.35),
    ('Cape Town Components Plant',     'Machine Safety Guard',           'daniel.fourie@artifax.demo',   4, 'Active',   false, 5,   0.70),
    ('Cape Town Components Plant',     'Lifting Sling Assembly',         'lerato.khumalo@artifax.demo', 10, 'Active',   false, 2,   0.20),
    ('Cape Town Components Plant',     'Safety Inspection Window',       'daniel.fourie@artifax.demo',   3, 'Active',   true,  1,   0.97),

    -- Paused
    ('Main Branch',                    'Pallet Rack Frame',              'naledi.dlamini@artifax.demo',  6, 'Paused',   false, 30,  0.50),
    ('Durban Assembly Plant',          'Industrial Extraction Fan',      'sipho.ndlovu@artifax.demo',    2, 'Paused',   false, 26,  0.30),

    -- Waiting in the queue
    ('Johannesburg Fabrication Plant', 'Steel Workbench 1800mm',         'thandi.mokoena@artifax.demo',  6, 'Queued',   false, 2,   0.0),
    ('Johannesburg Fabrication Plant', 'Pallet Rack Frame',              'pieter.vdmerwe@artifax.demo', 12, 'Queued',   false, 1,   0.0),
    ('Cape Town Components Plant',     'Machine Safety Guard',           'lerato.khumalo@artifax.demo',  8, 'Queued',   false, 1,   0.0),
    ('Cape Town Components Plant',     'Safety Inspection Window',       'daniel.fourie@artifax.demo',   4, 'Queued',   true,  1,   0.0),
    ('Main Branch',                    'Lifting Sling Assembly',         'ruan.botha@artifax.demo',     15, 'Queued',   false, 1,   0.0),
    ('Durban Assembly Plant',          'Electrical Control Panel',       'ayesha.patel@artifax.demo',    2, 'Queued',   false, 1,   0.0),

    -- Cancelled
    ('Durban Assembly Plant',          'Copper Busbar Distribution Kit', 'ayesha.patel@artifax.demo',    8, 'Cancelled', false, 220, 0.0),
    ('Main Branch',                    'Heavy-Duty Tool Cabinet',        'ruan.botha@artifax.demo',      3, 'Cancelled', false, 120, 0.0)
) AS v(branch, item, employee_email, qty, status, expedite, hours_ago, progress)
JOIN "Branches"  b ON b."BranchName"    = v.branch
JOIN "Items"     i ON i."ItemName"      = v.item
JOIN "Employees" e ON e."EmployeeEmail" = v.employee_email;

INSERT INTO "Orders" ("ItemID", "Quantity", "CreatedDateTime", "StartedDateTime", "CompletedDateTime",
                      "TotalTime", "TimeElapsed", "BranchID", "EmployeeID", "OrderExpedite", "Status")
SELECT
    s.item_id,
    s.qty,
    -- Active orders: make sure creation precedes the computed start time
    CASE WHEN s.status = 'Active'
         THEN LEAST(s.created_at, now() - make_interval(mins => floor(s.total_time * s.progress)::int + 10))
         ELSE s.created_at END,
    CASE s.status
         WHEN 'Complete' THEN s.created_at + interval '20 minutes'
         WHEN 'Paused'   THEN s.created_at + interval '30 minutes'
         WHEN 'Active'   THEN now() - make_interval(mins => floor(s.total_time * s.progress)::int)
         ELSE NULL END,
    CASE WHEN s.status = 'Complete'
         THEN s.created_at + interval '20 minutes' + make_interval(mins => s.total_time)
         ELSE NULL END,
    s.total_time,
    CASE s.status
         WHEN 'Complete' THEN s.total_time
         WHEN 'Active'   THEN floor(s.total_time * s.progress)::int
         WHEN 'Paused'   THEN floor(s.total_time * s.progress)::int
         ELSE 0 END,
    s.branch_id,
    s.employee_id,
    s.expedite,
    s.status
FROM seed_orders s
ORDER BY s.created_at;

-- ---------------------------------------------------------------------
-- Order history (status transitions), mirroring what the backend writes
-- ---------------------------------------------------------------------
-- Queued -> Active (scheduler)
INSERT INTO "OrderHistories" ("OrderID", "PreviousStatus", "NewStatus", "ChangedDateTime", "ChangedByEmployeeID", "ChangeReason")
SELECT o."OrderID", 'Queued', 'Active', o."StartedDateTime", NULL,
       'Auto-activated by background service (branch had < 3 active orders)'
FROM "Orders" o
WHERE o."StartedDateTime" IS NOT NULL;

-- Active -> Complete (scheduler)
INSERT INTO "OrderHistories" ("OrderID", "PreviousStatus", "NewStatus", "ChangedDateTime", "ChangedByEmployeeID", "ChangeReason")
SELECT o."OrderID", 'Active', 'Complete', o."CompletedDateTime", NULL,
       'Auto-completed by background service (elapsed time reached total time)'
FROM "Orders" o
WHERE o."Status" = 'Complete';

-- Active -> Paused (by the employee who owns the order)
INSERT INTO "OrderHistories" ("OrderID", "PreviousStatus", "NewStatus", "ChangedDateTime", "ChangedByEmployeeID", "ChangeReason")
SELECT o."OrderID", 'Active', 'Paused',
       o."StartedDateTime" + make_interval(mins => o."TimeElapsed"), o."EmployeeID",
       CASE WHEN o."OrderID" % 2 = 0 THEN 'Awaiting replacement welding wire delivery'
            ELSE 'Line stopped for scheduled machine maintenance' END
FROM "Orders" o
WHERE o."Status" = 'Paused';

-- Queued -> Cancelled
INSERT INTO "OrderHistories" ("OrderID", "PreviousStatus", "NewStatus", "ChangedDateTime", "ChangedByEmployeeID", "ChangeReason")
SELECT o."OrderID", 'Queued', 'Cancelled', o."CreatedDateTime" + interval '3 hours', o."EmployeeID",
       CASE WHEN o."OrderID" % 2 = 0 THEN 'Client postponed project to next quarter'
            ELSE 'Duplicate order raised in error' END
FROM "Orders" o
WHERE o."Status" = 'Cancelled';

-- Queue positions for queued orders (oldest first within each branch)
UPDATE "Orders" o
SET "QueuePosition" = q.pos
FROM (
    SELECT "OrderID", ROW_NUMBER() OVER (PARTITION BY "BranchID" ORDER BY "CreatedDateTime", "OrderID") AS pos
    FROM "Orders"
    WHERE "Status" = 'Queued'
) q
WHERE o."OrderID" = q."OrderID";

COMMIT;
