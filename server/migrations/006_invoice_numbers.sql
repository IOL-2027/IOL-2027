-- Invoices in Finance's template: a number such as IOL2027/23, given when the invoice details are first
-- saved, and the payer's tax identification number when their institution needs it on the invoice.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_recipient_tin text;

-- Invoices saved before this migration are numbered in the order they were created.
UPDATE payments p SET invoice_number = 'IOL2027/' || (n.position + (SELECT count(*) FROM payments WHERE invoice_number IS NOT NULL))
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position FROM payments WHERE invoice_number IS NULL) n
WHERE p.id = n.id;
SELECT setval('invoice_number_seq', GREATEST((SELECT count(*) FROM payments), 1), (SELECT count(*) FROM payments) > 0);
