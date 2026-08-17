# PawonLoka — Project Brain
> Last updated: 2026-08-17
> Always read this before building anything new.
> For deep POS-specific rules see: PAWONLOKA_POS_BRAIN.md

## 🍳 What is PawonLoka
PawonLoka ("pawon" = kitchen in Javanese, "loka" = place) is a full restaurant/cafe
management platform for a single Indonesian F&B outlet — a point-of-sale terminal plus
a back-office ERP covering sales, inventory/COGS, staff, and finance. It is one React
SPA (Vite), one Supabase (Postgres) project as the backend, deployed to Cloudflare Pages,
and additionally packaged as a native Android app (Capacitor 8) for the physical POS
terminal so it can talk to Bluetooth/network ESC/POS receipt printers.

One codebase, one Supabase project, **five apps** routed purely by URL path
(`src/App.jsx` — no router library, just `window.location.pathname` matching):

| Path | App | Audience |
|------|-----|----------|
| `/` | POS | Cashiers / kitchen — the till |
| `/backoffice` | Backoffice | Managers — admin, reports, settings (PIN-gated) |
| `/staff` | Staff Portal | Line staff — stock/waste/production self-reporting |
| `/owner` | Owner App | Business owner — read-only mobile dashboard |
| `/q/<tableName>` | Customer App | Guests — QR-code self-order at the table |

## 🔗 Project Links
| Item | Value |
|------|-------|
| Live URL | https://pawonloka.pages.dev |
| Backoffice | https://pawonloka.pages.dev/backoffice |
| Staff Portal | https://pawonloka.pages.dev/staff |
| Owner App | https://pawonloka.pages.dev/owner |
| Customer App | https://pawonloka.pages.dev/q/&lt;tableName&gt; |
| GitHub | https://github.com/RandyT25/PawonLoka |
| Supabase | https://fnfivhnisigfnbvojonz.supabase.co |
| Supabase Anon Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU |

## 🚀 Deploy Command
git add -A && git commit -m "msg" && git push && npm run deploy

---

## 📱 The Five Apps

### 1. POS — `src/pos/` (route `/`)
The cashier till, used on the physical Android tablet(s) in-store.
- `POS.jsx` (~1000+ lines) — main screen: menu grid, cart, table/floor-plan picker
- PIN login per staff (`PinLogin.jsx`) — no passwords, no sessions
- Floor plan with merge/split/move tables (`components/FloorPlan.jsx`)
- Cart with per-item modifiers, notes, item discounts (`Cart.jsx`, `ModifierModal.jsx`)
- Charge flow: full pay, split bill (equal/by-amount/by-item), promos, vouchers (`ChargeModal.jsx`, `PromoModal.jsx`, `SplitModal.jsx` — note SplitModal.jsx itself is unused, split UI actually lives inside ChargeModal)
- Shift open/close with cash float, product-sold report on close (`ShiftModal.jsx`)
- Clock in/out with required attendance selfie (`ClockInOutModal.jsx`)
- Void/refund gated by PIN (`VoidModal.jsx`)
- Custom (non-menu) item entry (`CustomItemModal.jsx`)
- Cash in/out during a shift (`CashInOutModal.jsx`)
- Bluetooth/network ESC/POS printing: pre-bill, receipt, kitchen tickets, checker, product-sold report (`hooks/usePrinter.js` → native `PrintBridge` Capacitor plugin on Android)
- Offline order queueing for spotty wifi (`hooks/useOfflineSync.js`, `lib/offlineStore.js`)
- Hold/recall orders, order history, reprint (`HoldRecall.jsx`, `OrdersModal.jsx`, `ReprintModal.jsx`)
- WhatsApp receipt send hook (`hooks/useWhatsApp.js`)

### 2. Backoffice — `src/backoffice/` (route `/backoffice`, PIN-gated, default PIN 1999)
The admin/manager dashboard. ~50 modules grouped into a sidebar nav
(`Backoffice.jsx` → `NAV` array). This is where recipes, COGS, purchasing, staff
scheduling, P&L, and system settings all live. Full current module map:

- **Overview** — Dashboard, Sales Analysis, Menu Performance, Sales Report, Product Report, Top & Slow Moving, Reports & Export
- **Finance** — Accounting (P&L / Kas Bon / Cashier Closing tabs), Rekonsiliasi (cash + bank/QRIS reconciliation), Assets (fixed asset register — kitchen equipment, appliances, furniture, with qty/unit price)
- **Menu** — Products, Categories, Modifiers, Recipes & COGS, Market Prices, Profitability
- **Inventory** — Overview, Ingredients, Supplies, Purchase Orders, Suppliers, Production, Stock Opname, Waste Recording, Movement History, Stock vs Purchase (compare theoretical vs actual), Units of Measure, Item Categories, **Staff Reports** (approval queue for everything submitted from the Staff Portal — leads with Pending)
- **People** — Employees, Departments, Shifts, Schedule, Attendance, Performance, Customers, Loyalty & Vouchers
- **Sales** — Promotions, Bundle Packages, Discounts, Payments & Tax
- **Operations** — Floor Plan, Kitchen Display (on-screen KDS — separate from physical kitchen-printer tickets)
- **System** — Import/Export, Settings, Receipt Designer, Kitchen Ticket Designer, Hardware, Users & Access, Audit Log, Order Anomalies (drill-down into flagged/deleted orders), Integrations (WhatsApp Business, GoBiz/GoFood — external channel placeholders)

### 3. Staff Portal — `src/staff/StaffPortal.jsx` (route `/staff`)
Simplified mobile-first screens for line staff to self-report inventory events,
grouped by station (Kitchen / Snack / Bar / Kasir — a station shows only the screens
relevant to it, e.g. Kasir only sees Requisition):
- **Stock Count** (opname), **Waste/Spoilage**, **Staff Meal / Personal Use** (consumption),
  **Production Batch**, **Request Ingredients** (requisition)
- Everything submitted here writes to `staff_submissions` as **Pending** and does NOT
  touch stock until a manager approves it in Backoffice → Staff Reports.
- No PIN — a per-station staff picker instead (`StaffPicker`).

### 4. Owner App — `src/owner/OwnerApp.jsx` (route `/owner`)
Lightweight read-only mobile dashboard for the business owner, Indonesian labels,
just 4 tabs: **Dashboard, Produk, Karyawan (staff), Arus Kas (cash flow)**. No admin
actions, no PIN gate — pure reporting surface meant to be checked from a phone.

### 5. Customer App — `src/customer/CustomerApp.jsx` (route `/q/<tableName>`)
QR-code self-order menu for guests. Table has a QR code encoding `/q/<table name>`;
scanning it loads the menu for that table, lets the guest browse, pick modifiers, add
notes, and submit an order directly into the `orders` table (`pay:'-'`, `staff:'Self Order'`,
marks the `tables` row `Occupied`) — no login, no payment (cashier settles later at POS).

---

## 📱 Android APK — ALWAYS DO THIS AFTER CODE CHANGES
Project path: `/Users/randy/PawonLoka-POS-Dashboard` (SINGLE project — android/ is a subfolder, NOT a separate copy)
Only rebuild for changes touching pos/staff/customer/owner apps — pure Backoffice-only changes don't need an APK rebuild since Backoffice is web-only (not bundled into the APK's primary flow, though it is included in the built dist).

- `android/` subfolder contains the native Android project
- `capacitor.config.ts` at root
- No file syncing needed — `npm run build && npx cap sync android` handles it

### Build steps (run from /Users/randy/PawonLoka-POS-Dashboard):
```bash
npm run build
npx cap sync android
JAVA_HOME=/Users/randy/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.19+10/Contents/Home \
  ./android/gradlew -p ./android assembleDebug
cp ./android/app/build/outputs/apk/debug/app-debug.apk ~/Desktop/PawonLoka-POS.apk
```

### APK-specific config (already set, do not change):
- `targetSdkVersion=35` (Android 15) → EdgeToEdge mode → `index.html` has `body { padding-top: env(safe-area-inset-top) }`
- `AndroidManifest.xml`: ACCESS_FINE_LOCATION has NO maxSdkVersion restriction (needed for BleClient)
- `capacitor.config.ts`: `BluetoothLe.androidNeverForLocation: true`
- No keystore → debug build (signed with ~/.android/debug.keystore, installable via sideload)
- APK bundles web files at build time (webDir: dist) — no live URL, MUST rebuild for every web change
- JAVA_HOME: Eclipse Adoptium JDK 17 at `~/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.19+10/Contents/Home`
- Gradle: run as `./android/gradlew -p ./android ...` from project root — never `cd android && ./gradlew`
- Custom Kotlin plugin: `PrintBridge` (registered via Capacitor) → `EscPosBuilder.kt` builds ESC/POS byte sequences

## 🏗 Stack
- React 19 + Vite 8 + Supabase + Cloudflare Pages
- Mac environment (Randy MacBook Pro, zsh)
- No .env file — Supabase keys hardcoded in src/lib/supabase.js
- Backoffice PIN: 1999
- Logo: /public/logo.png

## 📁 Key Files
src/App.jsx                                          # Router: /, /backoffice, /staff, /owner, /q/:tableId
src/main.jsx                                         # React root + ErrorBoundary
src/lib/supabase.js                                  # Supabase client
src/shared/constants.js                              # PAY_METHODS, fmt, TAX_RATE (STAFF array here is legacy/unused fallback — real staff+PINs live in the `staff` table)
src/shared/dbWrite.js                                # Wrapper around Supabase writes — swallows schema/RLS errors, always check its return value
src/shared/orderPricing.js                           # Shared order/payment total math (explodeOrderPayments, computeOrderTotals)
src/shared/unitConversion.js                         # Ingredient unit conversion helpers
src/backoffice/Backoffice.jsx                        # Shell + sidebar (NAV array) + PIN + mobile hamburger
src/backoffice/backoffice.css                        # All styles + mobile @media 768px
src/backoffice/components/Dashboard.jsx
src/backoffice/components/Accounting.jsx             # P&L, expenses, cash flow, kas bon, cashier closing
src/backoffice/components/Rekonsiliasi.jsx           # Cash/bank/QRIS reconciliation
src/backoffice/components/Assets.jsx                 # Fixed asset register (qty, unit price)
src/backoffice/components/Products.jsx               # Quick Edit panel + bulk modifier assignment
src/backoffice/components/Categories.jsx
src/backoffice/components/Modifiers.jsx              # Modifier groups + link to products (grouped by category)
src/backoffice/components/RecipeEditor.jsx           # Recipe & COGS (NOT Recipes.jsx — orphaned)
src/backoffice/components/MarketPrices.jsx           # Market price tracking vs PO cost
src/backoffice/components/Profitability.jsx          # Menu profitability model
src/backoffice/components/Attendance.jsx             # Staff clock in/out report (photos enforced)
src/backoffice/components/Schedule.jsx               # Staff scheduling, station rotation
src/backoffice/components/StaffSubmissions.jsx       # Staff Reports — Pending-first approval queue, wired into P&L
src/backoffice/components/OrderAnomalies.jsx         # Flagged/deleted-order drill-down
src/backoffice/components/AuditLog.jsx                # Login / void / refund audit trail
src/backoffice/components/KitchenDisplay.jsx          # On-screen KDS
src/backoffice/components/UnitsOfMeasure.jsx          # Canonical unit list (replaces 4 hardcoded lists)
src/backoffice/components/inventory/InvIngredients.jsx  # Quick Edit + Categories manager
src/backoffice/components/inventory/InvPO.jsx        # Purchase Orders + WAC cascade
src/backoffice/components/inventory/InvSuppliers.jsx
src/backoffice/components/inventory/InvProduction.jsx
src/backoffice/components/inventory/InvOpname.jsx
src/backoffice/components/inventory/InvWaste.jsx
src/backoffice/components/inventory/InvMovements.jsx
src/backoffice/components/inventory/InvStockCompare.jsx  # Theoretical vs actual stock
src/backoffice/components/inventory/InvStaffConsumption.jsx  # Staff meal / personal use ledger
src/backoffice/components/Employees.jsx
src/backoffice/components/Departments.jsx
src/backoffice/components/UsersAccess.jsx
src/backoffice/components/Shifts.jsx
src/backoffice/components/Performance.jsx
src/backoffice/components/Customers.jsx
src/backoffice/components/Loyalty.jsx
src/backoffice/components/Promotions.jsx             # Saves to promos table
src/backoffice/components/Bundles.jsx                # Saves to bundles table
src/backoffice/components/Discounts.jsx              # Saves to discounts table
src/backoffice/components/PaymentsTax.jsx            # Saves to app_settings.payments
src/backoffice/components/FloorPlan.jsx              # Backoffice floor plan
src/backoffice/components/Settings.jsx               # Supabase-backed + auto_close_time field
src/backoffice/components/ReceiptDesigner.jsx        # Logo upload + B&W
src/backoffice/components/KitchenTicketDesigner.jsx  # Kitchen ticket layout config
src/backoffice/components/Hardware.jsx               # Saves to hardware_devices table
src/backoffice/components/Integrations.jsx           # WhatsApp Business, GoBiz/GoFood
src/backoffice/components/ImportExport.jsx
src/backoffice/components/exportUtils.js
src/pos/POS.jsx                                      # Main POS (1000+ lines)
src/pos/components/PinLogin.jsx
src/pos/components/MenuGrid.jsx
src/pos/components/MobileMenuSlider.jsx
src/pos/components/Cart.jsx
src/pos/components/ChargeModal.jsx
src/pos/components/PromoModal.jsx
src/pos/components/ModifierModal.jsx
src/pos/components/ShiftModal.jsx                    # Clock-in toast reminder on shift open
src/pos/components/ClockInOutModal.jsx                # Requires attendance photo
src/pos/components/FloorPlan.jsx                     # POS FloorPlan: Merge/Split/Move tables
src/pos/hooks/usePrinter.js                           # Bluetooth printer hook
src/pos/hooks/useOfflineSync.js
src/pos/hooks/useCart.js
src/staff/StaffPortal.jsx                             # All 5 staff self-report screens in one file
src/owner/OwnerApp.jsx                                # 4-tab read-only owner dashboard
src/customer/CustomerApp.jsx                          # QR self-order menu
public/_redirects                                     # Cloudflare SPA routing
public/logo.png

## 🗄 Supabase Tables

### CRITICAL COLUMN NAMING
- products: PK=sku (NOT id), has linked_modifiers JSONB DEFAULT '[]'
- recipes: PK=productSku (NOT NULL), also has product_id col — always use productSku
- purchase_orders: camelCase cols (supplierId, supplierName, invoiceNo, dueDate), items=JSONB
- shifts: clock_in/clock_out = "HH.mm" strings. Use date for filtering
- tables: INTEGER PK, uses area (not section), has shape/status/active, has merged_with TEXT
- staff: TEXT PK ("STAFF-xxx"), has salary/phone/join_date/permissions(jsonb). **role is JSONB array** (migrated 2026-07-18 from a single string — one staff member can hold multiple station roles, e.g. `["Cook","Bakar"]`)
- sub_recipes: id, name, unit (BASE unit for recipe calcs), cost_per_unit, yield_qty, yield_unit, ingredient_id
- ingredients: Semi-finished category = sub-recipes; station is TEXT[] not TEXT
- market_prices: id, ingredient_id, ingredient_name, price, unit, conv_qty, source, checked_by, checked_at, notes
- profitability_settings: id=main, target_food_cost NUMERIC
- assets: has qty and unit_price columns (added 2026-08-16)

### ALL TABLES
ingredients, products, customers, purchase_orders, suppliers
stock_movements, stock_opname, waste_records, production_batches
recipes, sub_recipes, sub_recipe_ingredients
modifier_groups, promos, discounts, bundles, vouchers
staff_submissions, shifts, staff, schedules, attendance
tables, app_settings, expenses, kas_bon, opening_balance
hardware_devices, audit_logs, market_prices, profitability_settings
cash_flows, reconciliations, order_anomalies, assets

### app_settings columns
id(main), outlet(jsonb), pos_behaviour(jsonb), regional(jsonb),
loyalty(jsonb), stations(jsonb), receipt(jsonb), hardware(jsonb),
payments(jsonb), updated_at

### pos_behaviour jsonb structure
{ auto_print_receipt, kitchen_display, cashier_discounts,
  require_pin_void, require_pin_refund, auto_member_discount,
  auto_close_time: "HH:MM" string (empty = disabled) }
Note: `kitchen_display` (on-screen KDS) and `auto_print_stations` (physical kitchen printers) are separate settings — don't conflate them.

### payments jsonb structure
{ tax:{enabled,rate,type}, service:{enabled,rate},
  rounding:{enabled,roundTo}, methods:[{id,name,icon,note,enabled,surcharge}] }

### STORAGE BUCKETS
- logos (public) — color + B&W receipt logos
- attendance-photos (public) — clock in/out selfies (now enforced, not optional)

### RLS
All tables: allow_all policy, anon full access
market_prices: allow_all policy created
profitability_settings: allow_all policy created

## 👤 Staff & PINs
Staff, PINs, and station roles are **DB-managed**, not hardcoded — edit them in
Backoffice → People → Employees / Users & Access. `staff.role` is a JSONB array so one
person can cover multiple stations. Snapshot as of 2026-08-17 (query `staff` table for
current truth, this drifts):

| Name | Role(s) | PIN | DB ID |
|------|---------|-----|-------|
| Claudy | Owner | 7777 | STAFF-1781602869194 |
| Nita | Kasir, Bar | 4444 | STAFF-2 |
| Jovita | Snack, Kasir | 2222 | STAFF-3 |
| Mahes | Bar | 2222 | STAFF-4 |
| Meldy | Cook, Bakar | 3333 | STAFF-5 |
| Oji | Cook | 5555 | STAFF-6 |
| Yudi | Cook | 6666 | STAFF-7 |
| Alin | Snack | 8888 | STAFF-1779631556126 |

Backoffice PIN (separate from staff PINs, gates the whole `/backoffice` app): **1999**

## 🔌 POS ↔ Backoffice Sync Status
- Products/menu → products table ✅
- Categories → categories table ✅
- Staff PINs → staff table ✅
- Tables → tables table ✅ (has merged_with column)
- Modifiers → modifier_groups table ✅ (filtered by linked_modifiers on product)
- linked_modifiers: empty array = show ALL modifiers (backward compat)
- Payment methods → app_settings.payments ✅
- Tax/Service rate → app_settings.payments ✅
- Discounts → discounts table ✅
- Promos/Vouchers → promos table ✅
- Bundles → bundles table ✅
- Receipt settings → app_settings.receipt ✅
- Orders → orders table ✅
- Attendance → attendance table ✅ (photo required)
- Shifts → shifts table ✅
- Customers/loyalty → customers table ✅
- Hardware devices → hardware_devices table ✅
- Staff self-reports (opname/waste/consumption/production/requisition) → staff_submissions → approved → applied to stock ✅

## 📅 Schedule Rules
- Stations: Kasir, Bar, Bakar, Snack, Kitchen
- OFF: Mon=2, Tue/Wed/Thu/Fri/Sun=1, Sat=0
- Default OFF: Mon=Alin+Meldy, Tue=Nita, Wed=Aisyah, Thu=Mahes, Fri=Yudi, Sun=Oji (staff roster has since changed — Aisyah → Jovita; re-verify against current Schedule module before relying on this)
- Cascade: Kasir=Nita(→Aisyah), Bar=Aisyah(→Mahes→Nita), Bakar=Yudi(→Meldy)

## 💡 WAC Cascade (InvPO.jsx)
PO Paid → toBaseUnit → WAC calc → update ingredients → log stock_movements
→ cascadeRecalc: sub_recipe_ingredients → sub_recipe cost → recipes → product.cogs

## 🧾 Accounting Module
Tabs: Overview | Laba Rugi | Pengeluaran | Arus Kas | Kas Bon | Cashier Closing
Expense categories (auto): Bahan Baku(PO), Gaji(salary)
Opening balance: per month, stored in opening_balance table
Cashier Closing: reads from shifts table, shows float/cash/total/status
Staff Reports (approved staff_submissions) now feed into P&L — waste/consumption show up as cost, not just an inventory-only ledger.

## 📱 Mobile Backoffice
- Hamburger (☰) → slide-in LEFT sidebar 280px, auto-closes on select
- Modals: slide up from bottom, border-radius 20px, max-height 88dvh
- Tables: horizontal scroll, sticky last column
- CSS breakpoint: 768px in backoffice.css

## 🍽 Recipes & COGS Architecture
- Dishes tab: reads from products + recipes tables
- Sub-recipes tab: reads from sub_recipes + sub_recipe_ingredients tables
- Semi-finished ingredients auto-sync to sub_recipes on load
- recipes PK = productSku (always use this, NOT product_id)
- delete recipes: .eq("productSku", item.id) NOT .eq("product_id", ...)
- Sub-recipe cost unit: stored in sub_recipes.unit AND sub_recipes.yield_unit
- CRITICAL: sub_recipes.unit must match the unit used in parent dish recipes
- ingredient_id in recipes can be either ING-xxx (raw ingredient) or SR-ING-xxx (sub-recipe from ingredients table)
- SR-ING-xxx items exist in BOTH ingredients table AND sub_recipes table
- RecipeEditor loads: products, sub_recipes, ingredients, sub_recipe_ingredients (in that order)
- hasRecipeFlag for dishes: checks recipes table for productSku match
- hasRecipeFlag for sub-recipes: checks sub_recipe_ingredients table for sub_recipe_id match
- "Has recipe · No price" amber label: dish has recipe rows but cogs=0
- Supplies (as distinct from raw ingredients) are now usable directly in recipe COGS, not just inventory tracking.

## 🛒 Market Prices Module
- Pre-populated list of all ingredients (excludes Semi-finished)
- Buy unit + conversion factor per ingredient
- Saves to market_prices table + updates ingredients.conversions.last_price
- Market price save requires a price value (buy_unit only changes don't save to market_prices)
- checkedBy hardcoded as "Claudy" until PIN-based auth is added
- conv_qty column added to market_prices table

## 📊 Profitability Module
- Reads from products (sku, name, cat, price, cogs)
- Target food cost configurable (30/35/40/45%) saved to profitability_settings
- Editable "Harga Baru" column — live recalculates COGS%, delta, profit
- "Apply Price Changes" button — bulk updates products table
- Export to Excel

## 🐛 Critical Rules
1. Heredoc: use quoted ENDOFFILE for JSX
2. Rewrites: python3 open(path,'w') NOT cat > (zsh appends)
3. zsh standalone # = error — embed in python3
4. NEVER define components inside parent — 1-char typing bug
5. Use .maybeSingle() not .single()
6. products PK = sku, tables PK = integer
7. shifts clock_in = "HH.mm" string NOT timestamp
8. NEVER patch InvIngredients.jsx divs — rewrite full modal or git restore
9. Mobile fixes: CSS only, never change JSX layout for mobile
10. Overlay: onMouseDown not onClick
11. RecipeEditor used (NOT Recipes.jsx — that file is orphaned)
12. promos table = Promotions module + POS PromoModal
13. discounts table = Discounts module + POS Cart order discount
14. PaymentsTax saves to app_settings.payments — POS reads on load
15. ChargeModal: taxRate prop passed from POS, hide tax row when tax=0
16. PWA: NO service worker navigation cache — caused 308 on Cloudflare
17. zsh: backticks in python strings cause "bad substitution" — use /tmp files
18. Promise.all order matters — wrong order causes toLowerCase crash
19. Auto-close POS: reads appSettings.pos_behaviour.auto_close_time (NOT pos.auto_close_time)
20. useEffect order in POS.jsx: auto-close effect MUST be placed AFTER all state declarations
21. pe before initialization error = useEffect placed before state declarations OR circular import
22. ingredients.station is TEXT[] — use array operations not string comparison
23. Sub-recipe unit (sub_recipes.unit) must match what parent dish recipe row uses
24. FloorPlan merge/split needs merged_with column: ALTER TABLE tables ADD COLUMN IF NOT EXISTS merged_with TEXT DEFAULT NULL
25. APK Gradle: ALWAYS set JAVA_HOME explicitly — Java not found in system PATH for Gradle tasks
26. APK Gradle: run `./android/gradlew -p ./android assembleDebug` from project root, NOT `cd android && ./gradlew`
27. printBill() outlet object must include ALL receipt designer fields (name, address, phone, website, tagline, showOrderId, showTable, showCashier, showDatetime) — not just 3 fields
28. Checker print (printCheck) calls printKitchenTicket() with stationRole='receipt', NOT printPreBill() — kitchen settings apply, not receipt settings
29. Kitchen ticket TALL_ON double-height: only applied when stationRole != 'receipt' in EscPosBuilder.kt
30. Long item names: use truncLine() not padLine() in EscPosBuilder.kt — padLine wraps, truncLine cuts at available width
31. dbWrite() swallows schema/RLS errors silently — always check its return value, and verify against the live prod Supabase schema, not just the JS code, when writes seem to silently no-op
32. A recurring bug class in this codebase: the writer and reader of the same JSONB field use different field names, and nothing (no schema) catches it — when a feature "isn't saving," check both ends' field names before assuming an RLS/write issue
33. Orphan-approval / batch integrity checks (staff_submissions) must not silently truncate on large batches — this caused false-positive anomaly flags once already
34. Month-boundary date math (P&L projection, Kas Bon filters) has repeatedly used the wrong date basis — double-check which date field/timezone a "this month" filter actually uses

## ✅ Completed Modules (Current)
Dashboard, Sales Analysis, Menu Performance, Sales Report, Product Report, Top & Slow Moving,
Reports & Export, Accounting (P&L/Kas Bon/Cashier Closing), Rekonsiliasi, Assets,
Products (+ Quick Edit + Bulk Modifiers), Categories, Modifiers (+ Link to Products grouped by category),
Recipes & COGS, Market Prices, Profitability Model, Employees, Departments, Shifts, Schedule,
Attendance (+ enforced photo), Performance, Customers, Loyalty & Vouchers, Promotions, Bundles,
Discounts, Payments & Tax, Floor Plan (Merge/Split/Move), Kitchen Display (on-screen KDS),
Import/Export, Settings (+ Auto-close time), Receipt Designer, Kitchen Ticket Designer, Hardware,
Users & Access, Audit Log, Order Anomalies (+ drill-down), Integrations,
Inventory (Overview, Ingredients, Supplies, PO, Suppliers, Production, Opname, Waste,
Movements, Stock vs Purchase, Units of Measure, Item Categories), Staff Reports
(Pending-first, wired into P&L), Orders History, Split Bill, Laporan Produk Terjual (shift close)

## 🧾 Split Bill Architecture (ChargeModal + POS.jsx)
- Split UI lives inside ChargeModal tabs (not SplitModal.jsx — that file exists but is unused)
- chargeSplit() → sets activeSplit { amount, label, splitItems } → switches to pay tab
- handleCharge() in POS.jsx: split path writes payments[] to DB on EVERY split (not just final)
- Final split: pay='Split', status='Paid', total=billTotal, payments=[all split entries]
- Receipt: by-item → items filtered to splitItems only; equal/by-amount → full cart + _splitAmount/_splitRemaining metadata printed as "Dibayar / Sisa Tagihan"
- buildProductSoldReport() in usePrinter.js → called from ShiftModal after shift close prompt

## 🔧 PENDING / KNOWN ISSUES
*(Carried forward from 2026-06-28 — re-verify before trusting, this list predates several feature waves)*
- Printer receipt not printing after payment (GATT drops — 800ms delay workaround deployed)
- Kitchen printer routing per category — built in constants but untested
- Profitability: unsaved editPrices lost on navigation (no warning)
- InvIngredients: station field is TEXT[] but some queries use string comparison
- Bundle size 1.85MB — no code splitting (React.lazy not yet implemented)
- Supabase anon key hardcoded in src/lib/supabase.js (security risk for production)
- No per-user auth (PIN only, no sessions)
- Deferred printer settings (require new EscPosBuilder.kt sections): show_loyalty, show_sku, show_qr/qr_url, print_copies, station_colors, show_pax

## 📜 Recent Feature History (most recent first, see `git log` for full detail)
- Wired Staff Reports into P&L, clarified Stock vs Purchase, fixed Schedule bugs, enforced attendance photos, added anomaly drill-down, expanded Assets (qty/unit price)
- Redesigned Staff Reports to lead with Pending; fixed PIN input not capping at 4 digits
- Fixed orphan-approval check silently truncating on large batches (false positives)
- Fixed month projection using wrong date basis; orphan-ack moved server-side; Supplies made usable in recipe COGS
- Fixed Kas Bon tab ignoring the selected month filter
- Fixed POS orders silently failing to save + item notes being discarded
- Added bulk-acknowledge and surfaced silent submission/load failures
- Added staff consumption tracking (staff meals / personal use) as its own Staff Portal screen
- Fixed two critical stock-tracking bugs: broken recipe IDs, dead sale-movement logging
- staff.role migrated from single string to JSONB array (multi-position support)

## 🔧 TODO NEXT
- Fill in remaining recipes (many dishes still have no recipe entered)
- Fill in ingredient unit information (buy unit + conversion) for all ingredients
- Kitchen station printing test
- Re-verify the PENDING/KNOWN ISSUES list above against current behavior
