const fs = require('fs');
const file = 'src/pos/components/DailyStockModal.jsx';
let content = fs.readFileSync(file, 'utf8');

const oldMovementLoop = `const waste = {}
      ;(todayMovements || []).forEach(mov => {
        const ingId = mov.ingredient_id
        const qty = parseFloat(mov.qty) || 0
        if (mov.type === 'Sale') return
        
        if (qty > 0) {
          additions[ingId] = (additions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0) {
          waste[ingId] = (waste[ingId] || 0) + Math.abs(qty)
        }
      })`;

const newMovementLoop = `const waste = {}
      const production_deductions = {}
      ;(todayMovements || []).forEach(mov => {
        const ingId = mov.ingredient_id
        const qty = parseFloat(mov.qty) || 0
        if (mov.type === 'Sale') return
        
        if (qty > 0) {
          additions[ingId] = (additions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0 && mov.type === 'Production') {
          production_deductions[ingId] = (production_deductions[ingId] || 0) + Math.abs(qty)
        } else if (qty < 0) {
          waste[ingId] = (waste[ingId] || 0) + Math.abs(qty)
        }
      })`;

content = content.replace(oldMovementLoop, newMovementLoop);

content = content.replace(
  "const wasted = waste[ingId] || 0",
  "const wasted = waste[ingId] || 0\n        const prodDed = production_deductions[ingId] || 0"
);

content = content.replace(
  "Math.max(0, currentLiveStock + sold + wasted - added)",
  "Math.max(0, currentLiveStock + sold + wasted + prodDed - added)"
);

content = content.replace(
  "Math.max(0, openingStock + added - sold - wasted)",
  "Math.max(0, openingStock + added - sold - wasted - prodDed)"
);

content = content.replace(
  "waste_qty: Math.round(wasted * 100) / 100,",
  "waste_qty: Math.round(wasted * 100) / 100,\n          production_qty: Math.round(prodDed * 100) / 100,"
);

// Fix the expected_sisa logic injected in the previous step
content = content.replace(
  "const expected_sisa = Math.max(0, item.opening_stock + item.auto_added_qty - item.sold_qty - item.waste_qty);",
  "const expected_sisa = Math.max(0, item.opening_stock + item.auto_added_qty - item.sold_qty - item.waste_qty - (item.production_qty||0));"
);

content = content.replace(
  "waste_qty: item.waste_qty,",
  "waste_qty: item.waste_qty,\n          production_qty: item.production_qty,"
);

fs.writeFileSync(file, content);
console.log("POS UI split logic applied!");
