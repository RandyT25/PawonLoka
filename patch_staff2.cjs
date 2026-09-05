const fs = require('fs');
const file = 'src/staff/StaffPortal.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /async function submit\(type, data\) \{/g,
  `async function submit(type, data) {
    if (!staffName) { alert("Please select who is submitting"); return }
    setSaving(true)
    
    let isAutoAccept = false;
    if (type === "production") {
      const { data: settings } = await supabase.from('app_settings').select('pos_behaviour').eq('id', 'main').single();
      if (settings?.pos_behaviour?.auto_accept_production) {
        isAutoAccept = true;
      }
    }
    
    if (isAutoAccept) {
      // Auto accept logic for production
      try {
        const d = data;
        const outputIngredientId = d.item_id || subRecipes.find(sr=>sr.id===d.sub_recipe_id)?.ingredient_id;
        const item = outputIngredientId ? ingredients.find(i=>i.id===outputIngredientId) : null;
        const producedQty = d.actual_yield ?? d.batch_qty;
        const producedDate = d.date || new Date().toISOString().slice(0,10);
        const movId = () => "MOV-" + Date.now() + "-" + Math.random().toString(36).slice(2,6);
        const nowTime = () => new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
        
        for (const u of d.ingredients_used||[]) {
          const ing = ingredients.find(i=>i.id===u.ingredient_id);
          if (!ing) continue;
          const qtyBase = toBaseUnit(ing, u.qty||0, u.unit);
          const { data:freshIng } = await supabase.from("ingredients").select("stock").eq("id",ing.id).maybeSingle();
          const newStock = Math.max(0, (freshIng?.stock ?? ing.stock ?? 0) - qtyBase);
          await supabase.from("ingredients").update({ stock:newStock }).eq("id",ing.id);
          await supabase.from("stock_movements").insert({
            id: movId(), type:"Production", ingredient_id:ing.id, ingredient_name:ing.name,
            qty:-qtyBase, unit:ing.unit, ref: "SS-"+Date.now(),
            note:"Auto-approved production by "+staffName,
            date:producedDate, time:nowTime(),
          });
        }
        if (item) {
          const producedQtyBase = toBaseUnit(item, producedQty||0, d.yield_unit||d.unit||item.unit);
          const { data:freshItem } = await supabase.from("ingredients").select("stock").eq("id",item.id).maybeSingle();
          const newItemStock = (freshItem?.stock ?? item.stock ?? 0) + producedQtyBase;
          await supabase.from("ingredients").update({ stock:newItemStock }).eq("id",item.id);
          await supabase.from("stock_movements").insert({
            id: movId(), type:"Production", ingredient_id:item.id, ingredient_name:item.name,
            qty:producedQtyBase, unit:item.unit, ref: "SS-"+Date.now(),
            note:"Auto-approved production output by "+staffName,
            date:producedDate, time:nowTime(),
          });
        }
      } catch (err) {
        console.error("Auto accept failed", err);
      }
    }`
);

content = content.replace(
  /id:"SS-"\+Date\.now\(\), type, status:"pending",/g,
  `id:"SS-"+Date.now(), type, status: isAutoAccept ? "approved" : "pending",`
);

fs.writeFileSync(file, content);
console.log('StaffPortal patched');
