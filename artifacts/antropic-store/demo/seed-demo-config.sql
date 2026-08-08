-- Demo store configuration.
--
-- `pnpm --filter @workspace/scripts run seed` loads the catalog but leaves `settings`
-- and `pickup_points` empty, so the home hero, FAQ, returns and pickup pages render
-- with nothing in them. This fills those keys with plausible placeholder content so a
-- demo shows the real screens instead of empty states.
--
-- Placeholder content only — not production copy. Idempotent: re-running overwrites.

INSERT INTO settings (key, value) VALUES
  ('delivery_fee', '"12.00"'::jsonb),
  ('free_shipping_threshold', '"150.00"'::jsonb),
  ('promo_text', '"Envío gratis en compras desde S/ 150"'::jsonb),
  ('announcement_text', '"Nueva colección Verano 2025 — hasta 30% off en Sale"'::jsonb),
  ('hero', '{"title":"VERANO 2025","subtitle":"Nueva colección"}'::jsonb),
  ('editorial', '{"tag":"Editorial","title":"Estilo que habla por ti","imagePath":null}'::jsonb),
  ('contact', '{"whatsappNumber":"51999888777","instagramUrl":"https://instagram.com/","tiktokUrl":null}'::jsonb),
  ('returns_policy',
   '"Aceptamos cambios y devoluciones dentro de los 7 días calendario posteriores a la entrega, siempre que la prenda esté sin uso, con sus etiquetas originales y acompañada del comprobante de compra. Las prendas de la categoría Swim no admiten cambio por razones de higiene. El costo del envío de retorno corre por cuenta de la clienta, salvo que se trate de una falla de fábrica o de un error en el despacho."'::jsonb),
  ('faq', '[
     {"question":"¿Cuánto demora mi pedido?","answer":"Los pedidos con entrega a domicilio en Lima Metropolitana llegan entre 2 y 4 días hábiles. Para provincias, el plazo estimado es de 4 a 7 días hábiles."},
     {"question":"¿Cómo pago mi pedido?","answer":"El pago se realiza por Yape. Al finalizar la compra verás el número y el QR; luego adjuntas la constancia desde el detalle del pedido y el equipo la verifica."},
     {"question":"¿Puedo recoger en tienda?","answer":"Sí. Al momento del checkout puedes elegir recojo en uno de nuestros puntos en La Molina, sin costo de envío."},
     {"question":"¿Cómo sé qué talla elegir?","answer":"Cada producto tiene una tabla de medidas en la ficha, junto al selector de tallas. Si estás entre dos tallas, te recomendamos la mayor."},
     {"question":"¿Puedo cambiar una prenda?","answer":"Sí, dentro de los 7 días posteriores a la entrega y siempre que la prenda esté sin uso y con etiquetas. Puedes iniciar la solicitud desde la sección de devoluciones."}
   ]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO pickup_points (name, address, active)
SELECT * FROM (VALUES
  ('Showroom La Molina', 'Av. Javier Prado Este 5900, La Molina', true),
  ('Punto Rinconada', 'Av. La Fontana 1250, La Molina', true)
) AS v(name, address, active)
WHERE NOT EXISTS (SELECT 1 FROM pickup_points);
