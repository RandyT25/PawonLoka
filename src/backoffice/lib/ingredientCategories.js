// "General" deliberately excluded — every ingredient needs a real category, not a catch-all.
export const FOOD_CATEGORIES_FALLBACK   = ["Semi-finished","Poultry","Meat","Seafood","Vegetables","Fruits","Spices & Herbs","Dry Goods","Sauce","Beverages","Dairy","Bakery"]
export const SUPPLY_CATEGORIES_FALLBACK = ["Packaging","Disposables","Trash & Vacuum Bags","Cleaning & Sanitation","Kitchen Tools & Utensils","Office & Stationery","Charcoal","Other Supplies"]

// Mutable at runtime — Backoffice.jsx fetches app_settings.{food,supply}_categories once
// on mount and calls setFoodCategories()/setSupplyCategories() so any category
// added/renamed/deleted via the Categories settings page is reflected everywhere
// isSupplyCategory/isFoodCategory are used (Dashboard, InvOverview, RecipeEditor,
// InvIngredients), not just the picklist.
let foodCategories   = FOOD_CATEGORIES_FALLBACK
let supplyCategories = SUPPLY_CATEGORIES_FALLBACK
let CATEGORY_BUCKET  = buildBucket()

function buildBucket() {
  return Object.fromEntries([
    ...foodCategories.map(c => [c, "ingredient"]),
    ...supplyCategories.map(c => [c, "supply"]),
  ])
}

export function setFoodCategories(names) {
  if (!names || !names.length) return
  foodCategories = names
  CATEGORY_BUCKET = buildBucket()
}

export function setSupplyCategories(names) {
  if (!names || !names.length) return
  supplyCategories = names
  CATEGORY_BUCKET = buildBucket()
}

export function getFoodCategories()   { return foodCategories }
export function getSupplyCategories() { return supplyCategories }

export function isSupplyCategory(cat) { return CATEGORY_BUCKET[cat] === "supply" }
export function isFoodCategory(cat) { return !isSupplyCategory(cat) }

export const ALL_CATEGORIES = [...FOOD_CATEGORIES_FALLBACK, ...SUPPLY_CATEGORIES_FALLBACK]
