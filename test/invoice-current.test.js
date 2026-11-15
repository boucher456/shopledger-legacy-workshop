var test = require('node:test');
var assert = require('node:assert/strict');

var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var tax = require('../lib/tax');

test('invoice figures match the billed order totals for HSN GST and a coupon', function () {
  var order = {
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 600, qty: 1 }],
    coupon: 'SAVE10'
  };
  var billed = pricing.computeTotals(order.items, order.coupon);
  var figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: figures.subtotal, discount: figures.discount, tax: figures.tax, cgst: figures.cgst, sgst: figures.sgst, total: figures.total },
    { subtotal: billed.subtotal, discount: billed.discount, tax: billed.tax, cgst: billed.cgst, sgst: billed.sgst, total: billed.total }
  );
  assert.equal(figures.rows[0].gstPercent, billed.lines[0].gstPercent);
  assert.equal(figures.rows[0].lineTax, billed.lines[0].tax);
});

test('invoice uses the billed order HSN GST slab', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var orderTotals = pricing.computeTotals(items, '');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items });

  assert.equal(tax.getRateForItem(items[0]), 0.05);
  assert.deepEqual(
    { subtotal: orderTotals.subtotal, tax: orderTotals.tax, total: orderTotals.total },
    { subtotal: 100, tax: 5, total: 105 }
  );
  assert.deepEqual(
    { subtotal: invoiceFigures.subtotal, tax: invoiceFigures.tax, total: invoiceFigures.total },
    { subtotal: 100, tax: 5, total: 105 }
  );
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
});

test('invoice respects decimal gstRate values the same way as order pricing', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Decimal rate item', price: 100, qty: 1, gstRate: 0.05 }]
  });

  assert.equal(figures.tax, 5);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.total, 105);
});

test('invoice applies the same coupon discount and post-discount GST as order pricing', function () {
  var items = [{ name: 'Rice', hsn: '1006', price: 600, qty: 1 }];
  var orderTotals = pricing.computeTotals(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.deepEqual(
    { discount: orderTotals.discount, tax: orderTotals.tax, total: orderTotals.total },
    { discount: 60, tax: 27, total: 567 }
  );
  assert.deepEqual(
    { discount: invoiceFigures.discount, tax: invoiceFigures.tax, total: invoiceFigures.total },
    { discount: 60, tax: 27, total: 567 }
  );
});

test('invoice uses the order GST rounding and CGST/SGST split', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Odd tax', price: 1, qty: 1, gstRate: 1 }]
  });

  assert.equal(figures.tax, 1);
  assert.equal(figures.cgst, 0.5);
  assert.equal(figures.sgst, 0.5);
});

test('rendered invoice matches ledger totals without a mismatch notice for an HSN order', function () {
  var html = invoice.render({
    id: 42,
    date: '2026-11-15',
    customer: 'Test Customer',
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    subtotal: 100,
    discount: 0,
    tax: 5,
    total: 105
  });

  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹5\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹105\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});
