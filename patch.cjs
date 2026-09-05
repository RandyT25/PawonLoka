const fs = require('fs');
const file = 'src/pos/components/DailyStockModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Timezone fix
content = content.replace(
  `const today = useMemo(() => new Date().toISOString().slice(0, 10), [])`,
  `const today = useMemo(() => {
    const d = new Date()
    return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`
  }, [])`
);

// 2. Limit increase to 30
content = content.replace(
  `.order('submitted_at', { ascending: false }).limit(10)`,
  `.order('submitted_at', { ascending: false }).limit(30)`
);

// 3. Insert states
content = content.replace(
  `const [notes, setNotes] = useState('')`,
  `const [notes, setNotes] = useState('')\n  const [manualAdded, setManualAdded] = useState({})\n  const [checkedWarning, setCheckedWarning] = useState(false)`
);

// 4. Update expected_sisa calculation and rows initialization
content = content.replace(
  `const expectedSisa = openingStock + added - sold - wasted`,
  `const autoAdded = added\n          const finalAdded = manualAdded[ing.id] !== undefined ? (parseFloat(manualAdded[ing.id]) || 0) : added\n          const expectedSisa = openingStock + finalAdded - sold - wasted`
);

// In loadData, we need to initialize manualAdded if it's empty.
// Wait, doing it inside useMemo might be tricky since manualAdded is a state.
// We can just rely on `manualAdded[ing.id] ?? added` in the render.
