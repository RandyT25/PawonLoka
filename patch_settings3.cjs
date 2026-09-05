const fs = require('fs');
const file = 'src/backoffice/components/Settings.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\["auto_member_discount","Auto-apply member discount \(Gold 5\%\)"\],/g,
  `["auto_member_discount","Auto-apply member discount (Gold 5%)"],
            ["auto_accept_production","Auto-Accept Kitchen Production"],`
);

fs.writeFileSync(file, content);
console.log('Settings patched fully');
