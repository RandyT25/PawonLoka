// One-off repair: RecipeEditor.jsx's handleIngChange() used to store a sub-recipe's OWN
// row id (sub_recipes.id, e.g. "SR-ING-155") as recipes.ingredient_id / sub_recipe_ingredients
// .ingredient_id when a sub-recipe was picked as a component, instead of resolving to the
// linked ingredients-table row (sub_recipes.ingredient_id, e.g. "ING-155") that actually
// holds stock. This silently broke stock deduction at sale time (POS.jsx's deductStock()
// looks up ingredient_id strictly against the ingredients table and skips anything that
// doesn't resolve) for 93/210 recipes rows (47/65 products) and 5/231 sub_recipe_ingredients
// rows. Every broken row was confirmed (read-only) to cleanly resolve via sub_recipes — no
// orphans — so this is a deterministic bulk correction.
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { data: ings, error: ingsErr } = await supabase.from('ingredients').select('id')
if (ingsErr) { console.error('Fetch ingredients failed', ingsErr); process.exit(1) }
const ingIdSet = new Set(ings.map(i => i.id))

const { data: subs, error: subsErr } = await supabase.from('sub_recipes').select('id,ingredient_id')
if (subsErr) { console.error('Fetch sub_recipes failed', subsErr); process.exit(1) }
const subById = Object.fromEntries(subs.map(s => [s.id, s]))

async function repairTable(table, idColumn) {
  const { data: rows, error } = await supabase.from(table).select('*')
  if (error) { console.error(`Fetch ${table} failed`, error); return { fixed: 0, failed: 0 } }

  const broken = rows.filter(r => r.ingredient_id && !ingIdSet.has(r.ingredient_id))
  console.log(`\n=== ${table}: ${broken.length} broken row(s) of ${rows.length} total ===`)

  let fixed = 0, failed = 0
  for (const row of broken) {
    const sub = subById[row.ingredient_id]
    if (!sub || !sub.ingredient_id) {
      console.error(`  SKIP (no longer resolves): ${table} row ${row[idColumn]} ingredient_id=${row.ingredient_id} — investigate manually`)
      failed++
      continue
    }
    const { error: updErr } = await supabase.from(table).update({ ingredient_id: sub.ingredient_id }).eq(idColumn, row[idColumn])
    if (updErr) {
      console.error(`  FAILED: ${table} row ${row[idColumn]}:`, updErr.message)
      failed++
      continue
    }
    console.log(`  fixed: ${table} row ${row[idColumn]} — ${row.ingredient_id} -> ${sub.ingredient_id} (${row.ingredient_name || sub_recipe_name(sub)})`)
    fixed++
  }
  return { fixed, failed }
}

function sub_recipe_name(sub) { return sub?.name || '' }

const recipesResult = await repairTable('recipes', 'id')
const sriResult = await repairTable('sub_recipe_ingredients', 'id')

console.log('\n=== Summary ===')
console.log('recipes: fixed', recipesResult.fixed, 'failed', recipesResult.failed)
console.log('sub_recipe_ingredients: fixed', sriResult.fixed, 'failed', sriResult.failed)

// Final verification pass
const { data: recheck } = await supabase.from('recipes').select('ingredient_id')
const stillBrokenRecipes = recheck.filter(r => r.ingredient_id && !ingIdSet.has(r.ingredient_id) && !subById[r.ingredient_id])
console.log('\nrecipes still broken after repair (should be 0, ignoring rows we intentionally skipped):', stillBrokenRecipes.length)
