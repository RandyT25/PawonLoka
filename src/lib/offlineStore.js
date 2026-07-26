const DB_NAME    = 'pawonloka_offline'
const DB_VERSION = 1

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = () => reject(req.error)
  })
}

function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode)
    const store = t.objectStore(storeName)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  }))
}

export const offlineStore = {
  // ── Cache (static data: products, categories, etc.) ────────────────────────

  setCache(key, data) {
    return tx('cache', 'readwrite', s => s.put({ key, data, ts: Date.now() }))
  },

  async getCache(key) {
    const row = await tx('cache', 'readonly', s => s.get(key))
    return row?.data ?? null
  },

  // ── Queue (pending writes) ──────────────────────────────────────────────────

  enqueue(entry) {
    return tx('queue', 'readwrite', s => s.add({ ...entry, ts: Date.now() }))
  },

  getQueue() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('queue', 'readonly')
      const req = t.objectStore('queue').getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror   = () => reject(req.error)
    }))
  },

  dequeue(id) {
    return tx('queue', 'readwrite', s => s.delete(id))
  },

  updateEntry(entry) {
    return tx('queue', 'readwrite', s => s.put(entry))
  },
}

// ── Eager full sync — downloads everything needed for offline use ─────────────
const _syncTimeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('sync-timeout')), ms))

export async function offlineFullSync(supabase) {
  function syncQuery(q, key) {
    return Promise.race([q, _syncTimeout(8000)])
      .then(({data}) => data && offlineStore.setCache(key, data))
      .catch(() => {})
  }
  await Promise.allSettled([
    syncQuery(supabase.from('products').select('*').eq('active', true), 'products'),
    syncQuery(supabase.from('categories').select('*').order('sort'), 'categories'),
    syncQuery(supabase.from('modifier_groups').select('*'), 'modifier_groups'),
    syncQuery(supabase.from('discounts').select('*').eq('active', true), 'discounts'),
    syncQuery(supabase.from('bundles').select('*').eq('active', true), 'bundles'),
    syncQuery(supabase.from('tables').select('*').order('sort'), 'tables'),
    syncQuery(supabase.from('sub_recipes').select('*').order('name'), 'sub_recipes'),
    syncQuery(supabase.from('sub_recipe_ingredients').select('*'), 'sub_recipe_ingredients'),
    syncQuery(supabase.from('ingredients').select('id,name,unit,stock,cost_per_unit,category,station,min_stock').order('name'), 'ingredients'),
    // app_settings is a single object — handle separately
    Promise.race([supabase.from('app_settings').select('*').eq('id','main').maybeSingle(), _syncTimeout(8000)])
      .then(({data}) => data && offlineStore.setCache('app_settings', data)).catch(() => {}),
    // staff goes to localStorage
    Promise.race([supabase.from('staff').select('id,name,role,pin,color,active,permissions').eq('active', true).order('name'), _syncTimeout(8000)])
      .then(({data}) => { if (data?.length) localStorage.setItem('pos_staff_cache', JSON.stringify(data)) }).catch(() => {}),
  ])
}
