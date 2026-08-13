import { useState, useCallback } from 'react'
export default function useCart() {
  const [cart, setCart] = useState([])

  const addItem = useCallback((product, modifiers = {}) => {
    setCart(prev => {
      const key = product.sku + JSON.stringify(modifiers)
      const existing = prev.find(i => i._key === key)
      if (existing) return prev.map(i => i._key === key ? { ...i, qty: i.qty + 1 } : i)
      // note: product.note||'' — NOT a hardcoded '', which was silently discarding
      // whatever note the staff typed in ModifierModal's "Note / Special Request"
      // field the moment an item was first added (only editing the note again
      // afterward via Cart's inline Note button actually persisted).
      return [...prev, { ...product, qty: 1, modifiers, _key: key, note: product.note || '', itemDisc: 0 }]
    })
  }, [])

  const updateQty = useCallback((key, delta, patch = {}) => {
    setCart(prev => {
      const item = prev.find(i => i._key === key)
      if (!item) return prev
      const newQty = item.qty + delta
      if (newQty <= 0 && Object.keys(patch).length === 0) return prev.filter(i => i._key !== key)
      // If increasing qty on a sent item, mark as unsent so it goes to kitchen
      const sentPatch = (delta > 0 && item._sent) ? { _sent: false, _station: undefined } : {}
      return prev.map(i => i._key === key ? { ...i, qty: Math.max(1, newQty), ...sentPatch, ...patch } : i)
    })
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const subtotal = cart.reduce((a, i) => a + (i.price - (i.itemDisc || 0)) * i.qty, 0)

  return { cart, setCart, addItem, updateQty, clearCart, subtotal }
}
