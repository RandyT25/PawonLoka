export const STAFF = [
  { id:1, name:'Claudy', role:'Owner',      pin:'7777', color:'#6366F1' },
  { id:2, name:'Nita',   role:'Head Kasir', pin:'4444', color:'#F59E0B' },
  { id:3, name:'Aisyah', role:'Bar',        pin:'1111', color:'#10B981' },
  { id:4, name:'Mahes',  role:'Cook',       pin:'2222', color:'#3B82F6' },
  { id:5, name:'Meldy',  role:'Head Cook',  pin:'3333', color:'#8B5CF6' },
  { id:6, name:'Oji',    role:'Cook',       pin:'5555', color:'#EF4444' },
  { id:7, name:'Yudi',   role:'Cook',       pin:'6666', color:'#06B6D4' },
]

export const PAY_METHODS = [
  { id:'Cash',       label:'Cash',        icon:'💵' },
  { id:'QRIS',       label:'QRIS',        icon:'📱' },
  { id:'Transfer',   label:'Transfer',    icon:'🏦' },
  { id:'Debit',      label:'Debit',       icon:'💳' },
  { id:'GoFood',     label:'GoFood',      icon:'🚴' },
  { id:'GrabFood',   label:'GrabFood',    icon:'🟢' },
  { id:'ShopeeFood', label:'ShopeeFood',  icon:'🛍️' },
]

export const MODIFIERS = [
  { id:'sugar',  name:'Sugar Level',  options:['Normal','Less Sugar','No Sugar','Extra Sugar'] },
  { id:'ice',    name:'Ice Level',    options:['Normal Ice','Less Ice','No Ice','Extra Ice'] },
  { id:'milk',   name:'Milk Type',    options:['Full Cream','Low Fat','Oat Milk','No Milk'] },
  { id:'spice',  name:'Spice Level',  options:['Not Spicy','Medium','Spicy','Extra Spicy'] },
  { id:'size',   name:'Size',         options:['Regular','Large'] },
]

export const KITCHEN_STATIONS = {
  'Drinks':       'Bar',
  'Main Dishies': 'Kitchen',
  'Nasi & Mie':   'Kitchen',
  'Sate':         'Kitchen',
  'Snacks':       'Snack',
  'Dessert':      'Kitchen',
  'Ice Cream':    'Bar',
  'Jagung':       'Snack',
  'Gen-Z Specials':'Kitchen',
  'Extra':        'Kitchen',
  'Delivery':     'Kitchen',
}

export const fmt = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
export const TAX_RATE = 0.10
