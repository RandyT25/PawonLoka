const fs = require('fs');
const file = 'src/pos/components/DailyStockModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix date
content = content.replace(
  `const today = useMemo(() => new Date().toISOString().slice(0, 10), [])`,
  `const today = useMemo(() => {\n    const d = new Date()\n    return \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`\n  }, [])`
);

// 2. Increase existingRecon limit
content = content.replace(
  `limit(10)`,
  `limit(30)`
);

// 3. Add states for manual additions and warning
content = content.replace(
  `const [notes, setNotes]           = useState('')`,
  `const [notes, setNotes]           = useState('')\n  const [manualAdded, setManualAdded] = useState({})\n  const [checkedWarning, setCheckedWarning] = useState(false)`
);

// 4. In loadData, set initial manualAdded
// Find where setItems(recordedItems) is. Wait, is it recordedItems or rows?
// Let's find how `items` is set.
