const fs = require('fs');
const file = 'src/backoffice/components/Settings.jsx';
let content = fs.readFileSync(file, 'utf8');

// Inside pos_behaviour, there are checkboxes. We want to add one.
content = content.replace(
  /<label className="bo-checkbox"><input type="checkbox" checked=\{settings\.pos_behaviour\["require_shift_start"\]/g,
  `<label className="bo-checkbox"><input type="checkbox" checked={settings.pos_behaviour["auto_accept_production"]??false} onChange={e=>update("pos_behaviour","auto_accept_production",e.target.checked)} /> <div>Auto-Accept Kitchen Production <div className="bo-cb-desc">Production submitted via Staff Portal automatically updates live stock without Backoffice approval</div></div></label>
            <label className="bo-checkbox"><input type="checkbox" checked={settings.pos_behaviour["require_shift_start"]`
);

fs.writeFileSync(file, content);
console.log('Settings patched');
