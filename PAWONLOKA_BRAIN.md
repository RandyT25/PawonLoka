# PawonLoka — Project Brain
> Last updated: 2026-06-28
> Always read this before building anything new.
> For deep POS-specific rules see: PAWONLOKA_POS_BRAIN.md

## 🔗 Project Links
| Item | Value |
|------|-------|
| Live URL | https://pawonloka.pages.dev |
| Backoffice | https://pawonloka.pages.dev/backoffice |
| Staff Portal | https://pawonloka.pages.dev/staff |
| GitHub | https://github.com/RandyT25/PawonLoka |
| Supabase | https://fnfivhnisigfnbvojonz.supabase.co |
| Supabase Anon Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuZml2aG5pc2lnZm5idm9qb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjE2MzEsImV4cCI6MjA5NDU5NzYzMX0.8VE_PW4JO6H9Z5sIPCFy0jzLo6Zqo8_qzPRi9w9xBfU |

## 🚀 Deploy Command
git add -A && git commit -m "msg" && git push && npm run deploy

## 📱 Android APK — ALWAYS DO THIS AFTER CODE CHANGES
Project path: `/Users/randy/PawonLoka-POS-Dashboard` (SINGLE project — android/ is a subfolder, NOT a separate copy)

### ⚠️ Architecture change (2026-06-28): NO MORE dual-project setup
The old `/Users/randy/POS Android APK` separate project is OBSOLETE. The main web project now has Capacitor 8 integrated directly:
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
src/App.jsx                                          # Router: /, /backoffice, /staff
src/main.jsx                                         # React root + ErrorBoundary
src/lib/supabase.js                                  # Supabase client
src/shared/constants.js                              # STAFF array, PAY_METHODS, fmt, TAX_RATE
src/backoffice/Backoffice.jsx                        # Shell + sidebar + PIN + mobile hamburger
src/backoffice/backoffice.css                        # All styles + mobile @media 768px
src/backoffice/components/Dashboard.jsx
src/backoffice/components/Accounting.jsx             # P&L, expenses, cash flow, kas bon, cashier closing
src/backoffice/components/Products.jsx               # Quick Edit panel + bulk modifier assignment
src/backoffice/components/Categories.jsx
src/backoffice/components/Modifiers.jsx              # Modifier groups + link to products (grouped by category)
src/backoffice/components/RecipeEditor.jsx           # Recipe & COGS (NOT Recipes.jsx — orphaned)
src/backoffice/components/MarketPrices.jsx           # Market price tracking vs PO cost
src/backoffice/components/Profitability.jsx          # Menu profitability model
src/backoffice/components/Attendance.jsx             # Staff clock in/out report
src/backoffice/components/Inventory.jsx
src/backoffice/components/inventory/InvIngredients.jsx  # Quick Edit + Categories manager
src/backoffice/components/inventory/InvPO.jsx        # Purchase Orders + WAC cascade
src/backoffice/components/inventory/InvSuppliers.jsx
src/backoffice/components/inventory/InvProduction.jsx
src/backoffice/components/inventory/InvOpname.jsx
src/backoffice/components/inventory/InvWaste.jsx
src/backoffice/components/inventory/InvMovements.jsx
src/backoffice/components/Employees.jsx
src/backoffice/components/UsersAccess.jsx
src/backoffice/components/Schedule.jsx
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
src/backoffice/components/Hardware.jsx               # Saves to hardware_devices table
src/backoffice/components/ImportExport.jsx
src/backoffice/components/StaffSubmissions.jsx
src/backoffice/components/SearchSelect.jsx
src/pos/POS.jsx                                      # Main POS (1009 lines)
src/pos/components/PinLogin.jsx
src/pos/components/MenuGrid.jsx
src/pos/components/Cart.jsx
src/pos/components/ChargeModal.jsx
src/pos/components/PromoModal.jsx
src/pos/components/ModifierModal.jsx
src/pos/components/ShiftModal.jsx                    # Clock-in toast reminder on shift open
src/pos/components/FloorPlan.jsx                     # POS FloorPlan: Merge/Split/Move tables
src/pos/hooks/usePrinter.js                          # Bluetooth printer hook
src/staff/StaffPortal.jsx
public/_redirects                                    # Cloudflare SPA routing
public/logo.png

## 🗄 Supabase Tables

### CRITICAL COLUMN NAMING
- products: PK=sku (NOT id), has linked_modifiers JSONB DEFAULT '[]'
- recipes: PK=productSku (NOT NULL), also has product_id col — always use productSku
- purchase_orders: camelCase cols (supplierId, supplierName, invoiceNo, dueDate), items=JSONB
- shifts: clock_in/clock_out = "HH.mm" strings. Use date for filtering
- tables: INTEGER PK, uses area (not section), has shape/status/active, has merged_with TEXT
- staff: TEXT PK ("STAFF-xxx"), has salary/phone/join_date/permissions(jsonb)
- sub_recipes: id, name, unit (BASE unit for recipe calcs), cost_per_unit, yield_qty, yield_unit, ingredient_id
- ingredients: Semi-finished category = sub-recipes; station is TEXT[] not TEXT
- market_prices: id, ingredient_id, ingredient_name, price, unit, conv_qty, source, checked_by, checked_at, notes
- profitability_settings: id=main, target_food_cost NUMERIC

### ALL TABLES
ingredients, products, customers, purchase_orders, suppliers
stock_movements, stock_opname, waste_records, production_batches
recipes, sub_recipes, sub_recipe_ingredients
modifier_groups, promos, discounts, bundles, vouchers
staff_submissions, shifts, staff, schedules, attendance
tables, app_settings, expenses, kas_bon, opening_balance
hardware_devices, audit_logs, market_prices, profitability_settings

### app_settings columns
id(main), outlet(jsonb), pos_behaviour(jsonb), regional(jsonb),
loyalty(jsonb), stations(jsonb), receipt(jsonb), hardware(jsonb),
payments(jsonb), updated_at

### pos_behaviour jsonb structure
{ auto_print_receipt, kitchen_display, cashier_discounts,
  require_pin_void, require_pin_refund, auto_member_discount,
  auto_close_time: "HH:MM" string (empty = disabled) }

### payments jsonb structure
{ tax:{enabled,rate,type}, service:{enabled,rate},
  rounding:{enabled,roundTo}, methods:[{id,name,icon,note,enabled,surcharge}] }

### STORAGE BUCKETS
- logos (public) — color + B&W receipt logos
- attendance-photos (public) — clock in/out selfies

### RLS
All tables: allow_all policy, anon full access
market_prices: allow_all policy created
profitability_settings: allow_all policy created

## 👤 Staff
| Name | Role | PIN | Color | DB ID |
|------|------|-----|-------|-------|
| Claudy | Owner | 7777 | #6366F1 | STAFF-1 |
| Nita | Head Kasir | 4444 | #F59E0B | STAFF-2 |
| Aisyah | Bar | 1111 | #10B981 | STAFF-3 |
| Mahes | Cook Snack | 2222 | #3B82F6 | STAFF-4 |
| Meldy | Head Cook | 3333 | #8B5CF6 | STAFF-5 |
| Oji | Cook | 5555 | #EF4444 | STAFF-6 |
| Yudi | Cook | 6666 | #06B6D4 | STAFF-7 |
| Alin | Cook Snack | 8888 | — | STAFF-8 |

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
- Attendance → attendance table ✅
- Shifts → shifts table ✅
- Customers/loyalty → customers table ✅
- Hardware devices → hardware_devices table ✅

## 📅 Schedule Rules
- Stations: Kasir, Bar, Bakar, Snack, Kitchen
- OFF: Mon=2, Tue/Wed/Thu/Fri/Sun=1, Sat=0
- Default OFF: Mon=Alin+Meldy, Tue=Nita, Wed=Aisyah, Thu=Mahes, Fri=Yudi, Sun=Oji
- Cascade: Kasir=Nita(→Aisyah), Bar=Aisyah(→Mahes→Nita), Bakar=Yudi(→Meldy)

## 💡 WAC Cascade (InvPO.jsx)
PO Paid → toBaseUnit → WAC calc → update ingredients → log stock_movements
→ cascadeRecalc: sub_recipe_ingredients → sub_recipe cost → recipes → product.cogs

## 🧾 Accounting Module
Tabs: Overview | Laba Rugi | Pengeluaran | Arus Kas | Kas Bon | Cashier Closing
Expense categories (auto): Bahan Baku(PO), Gaji(salary)
Opening balance: per month, stored in opening_balance table
Cashier Closing: reads from shifts table, shows float/cash/total/status

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

## ✅ Completed Modules (Current)
Dashboard, Accounting (+ Cashier Closing tab), Products (+ Quick Edit + Bulk Modifiers),
Categories, Modifiers (+ Link to Products grouped by category), Recipes & COGS,
Market Prices, Profitability Model, Attendance Report,
Inventory (all 8 sub-screens), Staff Reports, Employees, Users & Access,
Schedule, Shifts, Performance, Customers, Loyalty, Promotions & Vouchers,
Bundles, Discounts, Payments & Tax, Floor Plan (Merge/Split/Move),
Settings (+ Auto-close time), Receipt Designer, Hardware, Import/Export,
Orders History, Staff Submissions, InvIngredients (Quick Edit + Categories),
Split Bill (fixed receipt + payments recording), Laporan Produk Terjual (shift close)

## 🧾 Split Bill Architecture (ChargeModal + POS.jsx)
- Split UI lives inside ChargeModal tabs (not SplitModal.jsx — that file exists but is unused)
- chargeSplit() → sets activeSplit { amount, label, splitItems } → switches to pay tab
- handleCharge() in POS.jsx: split path writes payments[] to DB on EVERY split (not just final)
- Final split: pay='Split', status='Paid', total=billTotal, payments=[all split entries]
- Receipt: by-item → items filtered to splitItems only; equal/by-amount → full cart + _splitAmount/_splitRemaining metadata printed as "Dibayar / Sisa Tagihan"
- buildProductSoldReport() in usePrinter.js → called from ShiftModal after shift close prompt

## 🔧 PENDING / KNOWN ISSUES
- Printer receipt not printing after payment (GATT drops — 800ms delay workaround deployed)
- Kitchen printer routing per category — built in constants but untested
- Profitability: unsaved editPrices lost on navigation (no warning)
- InvIngredients: station field is TEXT[] but some queries use string comparison
- Bundle size 1.85MB — no code splitting (React.lazy not yet implemented)
- Supabase anon key hardcoded in src/lib/supabase.js (security risk for production)
- No per-user auth (PIN only, no sessions)
- Deferred printer settings (require new EscPosBuilder.kt sections): show_loyalty, show_sku, show_qr/qr_url, print_copies, station_colors, show_pax

## 🖨 ESC/POS Print Functions (EscPosBuilder.kt)
- `buildPreBill()` — Cetak Tagihan (pre-payment bill with prices, no payment)
- `buildReceipt()` — Cetak Struk (full receipt after payment)
- `buildKitchenTicket()` — kitchen tickets AND checker (stationRole="receipt" → no TALL_ON, no double-height)
- `buildProductSoldReport()` — shift close product sold summary
- Key helpers: `padLine(left, right, width)`, `truncLine(left, right, width)` (truncates left at width - right - 1)
- ESC/POS cmds: BOLD_ON/OFF, TALL_ON/OFF (double-height), DOUBLE_ON/OFF (double height+width), ALIGN_C/L
- Logo sizes: 58mm paper = 200px width, 80mm paper = 300px width (reduced from 384/576px to avoid slowness)

## 🔧 TODO NEXT
- Physical device testing for current APK (built 2026-06-28 20:02, at ~/Desktop/PawonLoka-debug.apk):
  - Portrait mode header: Customer/Void hidden, Table/Orders/Printer/☰ visible
  - Checker print: normal item height (no double), long names truncated
  - Kitchen footer: text centered on physical print
  - Cetak Tagihan: receipt designer fields (tagline, show_table toggle, etc.) reflected
- Fill in remaining recipes (most dishes still have no recipe entered)
- Fill in ingredient unit information (buy unit + conversion) for all 200+ ingredients
- Kitchen station printing test
- Auto-close POS: set a time in Settings → POS Behaviour
