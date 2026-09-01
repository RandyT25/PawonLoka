import test from 'node:test'
import assert from 'node:assert/strict'
import { computeOrderTotals, explodeOrderPayments } from '../src/shared/orderPricing.js'

test('item discount, order discount, tax, points and Rupiah rounding use one canonical total', () => {
  // grossSubtotal = 10001×2 + 5000×1 = 25002
  // subtotal (after item disc) = (10001-1001)×2 + 5000 = 23000
  // discAmt = round(25002 × 10%) = 2500  ← applies to GROSS, not post-item-disc, so discounts don't compound
  // discount = 2500 + promoDisc500 + points100 = 3100
  // netBeforeTax = 23000 - 3100 = 19900
  // tax = round(19900 × 0.11) = 2189
  // total = 19900 + 2189 = 22089
  const result = computeOrderTotals({
    items: [{ price: 10_001, itemDisc: 1_001, qty: 2 }, { price: 5_000, qty: 1 }],
    discountPct: 10, promoDisc: 500, pointsValue: 100, taxRate: 0.11,
  })
  assert.deepEqual(result, { items: result.items, subtotal: 23_000, discount: 3_100, tax: 2_189, total: 22_089 })
})

test('split payment breakdown, not order.pay, is used for reconciliation', () => {
  assert.deepEqual(explodeOrderPayments({ pay:'Split', total:20_000, payments:[{ method:'Cash', amount:8_000 }, { method:'QRIS', amount:12_000 }] }), [
    { method:'Cash', amount:8_000 }, { method:'QRIS', amount:12_000 },
  ])
})
