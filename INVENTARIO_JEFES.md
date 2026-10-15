# Hacer inventario · 15 de octubre de 2026

Acceso principal **HACER INVENTARIO**, visible únicamente para fichas con puesto Jefe. La base de datos comprueba además la identidad autenticada del jefe; ocultar el botón no es la medida de seguridad. Las funciones son SECURITY INVOKER, respetan RLS y no pueden ejecutarse con la clave anónima.

El formulario muestra los productos del catálogo y todas las claves presentes en el almacén, incluida la pólvora como material. Los artículos se separan en PRODUCTOS y MATERIALES, con buscador y cantidades registradas. Los productos antiguos aún presentes en stock también aparecen, aunque ya no estén en el catálogo.

Una casilla vacía no se modifica. Escribir **0** confirma existencias cero. Solo se aceptan enteros entre 0 y 999999. **GUARDAR CAMBIOS** presenta las diferencias; **CONFIRMAR Y GUARDAR** realiza el ajuste. El borrador se conserva por jefe en el dispositivo.

Al abrir se leen cantidades y versiones de fila (xmin) directamente de Supabase. Al confirmar, la función bloquea datos y stock y comprueba cada artículo contado. Si una fila cambió, incluso si su cantidad volvió al valor anterior, se rechaza el recuento entero sin guardar ajustes parciales. **ACTUALIZAR STOCK Y REVISAR** conserva las casillas de artículos sin cambios y vacía las afectadas para contarlas otra vez.

El ajuste, los movimientos, el recuento y la actividad quedan guardados en una transacción, con jefe, fecha y cantidades anteriores/nuevas. Las diferencias quedan marcadas como revisadas al ajustarse. No se crean compras, ventas, gastos ni fabricación. Las reservas se mantienen: se avisa si superan las existencias físicas. Si la asignación al NPC supera el nuevo stock total, se reduce a ese máximo; no se crea una venta de NPC.

Cada guardado usa un UUID persistido antes de enviarse. Una respuesta perdida ofrece **RECUPERAR GUARDADO**, reutilizando la petición y sin repetir ajustes. Los mensajes utilizan el canal existente de stock y sus mecanismos actuales de Discord; su entrega es externa a la transacción y depende de la configuración y la conexión.

## Comprobaciones

Las pruebas locales de Postgres WASM y DOM verifican acceso de jefe y rechazo de trabajador/anónimo, RLS, versiones de fila, conflictos, cero frente a casilla vacía, valores inválidos, duplicados, reversión completa ante fallo de registro, reintentos, reservas y NPC. `npm ci && npm test` incluye también las regresiones de fabricación al vender. No se usa el almacén real ni se envían mensajes a Discord para probar.

## Copia recuperable

Rama anterior: `backup/antes-inventario-jefes-2026-10-15`, commit `62d2ca62001e5455838b47a74f6d53179c95112a`. Las funciones nuevas no sustituyen funciones ni permisos existentes. Para desactivar la interfaz, restaurar el HTML y app.js de esa copia; no eliminar funciones ni registros mientras pueda haber peticiones pendientes de recuperar.
