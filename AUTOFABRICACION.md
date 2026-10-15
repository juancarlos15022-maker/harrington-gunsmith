# Fabricación al vender · 15 de octubre de 2026

La venta directa utiliza primero el producto disponible, respetando las reservas de encargos con anticipo. Si faltan unidades, calcula su receta y permite seleccionarlas cuando hay ingredientes suficientes. El carrito muestra qué se fabricará al confirmar y comprueba los materiales compartidos de toda la venta.

`vender_fabricando` vuelve a calcular el plan con las recetas y las existencias de Supabase, bloquea stock y reservas durante la transacción y registra fabricación, consumo, movimientos, lotes, actividad y venta conjuntamente. Un error revierte también el contador. No se cambian funciones ni permisos existentes: las funciones nuevas son SECURITY INVOKER y utilizan los permisos y RLS actuales.

Cada petición tiene un UUID persistido antes de enviarse. Si se pierde la respuesta, FINALIZAR recupera esa misma operación. No crea otra fabricación ni otra venta. Los movimientos de fabricación conservan el formato usado por el balance de costes y quedan vinculados al número de venta.

Trabajadores y jefes utilizan el mismo proceso. La fabricación automática se vende inmediatamente y no genera un lote pendiente de venta nuevo. Los presupuestos, la creación de encargos y las entregas de encargos mantienen su circuito actual. Los ingredientes de la receta deben estar disponibles: no se encadenan automáticamente recetas intermedias (por ejemplo, fabricar pólvora antes de fabricar munición).

Los avisos utilizan los canales existentes de ventas, fabricación y almacén. Su entrega sigue dependiendo de la configuración y disponibilidad de Discord; no forma parte de la transacción de Postgres. No se enviaron mensajes reales como prueba.

## Verificación

`npm ci && npm test` ejecuta pruebas con Postgres WASM (PGlite) y DOM (jsdom). Ninguna se conecta a la base real. Casos: stock existente; déficit parcial; materiales compartidos; reservas de producto y de ingrediente; ingrediente también vendido; pólvora y alias; receta ausente; cantidades inválidas; autorización; RLS y SECURITY INVOKER; fallo de escritura con reversión completa; reintento idempotente; inicio de la página y aviso del carrito; aislamiento de presupuestos/encargos; respuesta perdida recuperada.

La serialización usa bloqueos de tablas de Postgres para que las comprobaciones de stock y reservas y las escrituras sean una única operación. Las pruebas aisladas verifican las transacciones y los reintentos, pero no sustituyen una prueba de carga con múltiples conexiones simultáneas.

## Copia y reversión

Código anterior: rama `backup/antes-autofabricacion-2026-10-15`, commit `c38883ee2d6dfd5cbbbadcb0b0477285b7973131`. El despliegue añade funciones, sin reescribir datos comerciales ni fabricar o vender existencias reales.

Para desactivar la función, restaurar primero `index.html` y `app.js` desde la copia y esperar a que se actualicen los clientes. Las funciones nuevas pueden permanecer sin uso. No borrarlas mientras haya clientes con peticiones pendientes de recuperar. No borrar registros `autoventa:`, ventas ni movimientos: conservan la trazabilidad y la protección de reintentos.
