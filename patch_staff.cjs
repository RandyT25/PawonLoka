const fs = require('fs');
const file = 'src/staff/StaffPortal.jsx';
let content = fs.readFileSync(file, 'utf8');

// We need to fetch settings first in submit() or earlier.
// Does StaffPortal load settings?
