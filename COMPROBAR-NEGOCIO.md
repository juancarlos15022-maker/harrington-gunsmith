# Comprobar negocio

Botón de la pantalla principal, visible solo para jefes con sesión propia y fuera del modo de pruebas. Reúne el dinero real y un recuento selectivo del almacén. El buscador no borra las cantidades ya introducidas; vacío omite un artículo y cero registra ausencia física. Conserva las existencias del NPC sin contarlas. Antes de guardar muestra faltantes, sobrantes y coincidencias.

`hg_negocio_guardar` valida al jefe en el servidor y llama a los circuitos existentes de inventario y caja dentro de una única transacción. Si una versión cambió, revierte todo. El importe contado pasa a ser la base de caja para las ventas y gastos posteriores; las diferencias anteriores permanecen en su registro. No crea gastos ni ventas para cuadrar. Las herramientas independientes de inventario y caja siguen disponibles.

La comprobación conserva fecha, responsable, dinero esperado y contado, artículos revisados, diferencias y la fecha del último inventario de cada artículo. Cuando no existe uno, se indica primer recuento registrado. Los movimientos posteriores ya están incluidos en los valores esperados. Solo los artículos contados se presentan como verificados; tampoco se cuenta el NPC. El historial muestra las últimas 30 comprobaciones y permite descargar cada resultado. Las anteriores siguen conservadas en la tabla privada y en Discord.

Una petición tiene UUID y huella de contenido: recuperar una respuesta perdida no duplica ajustes. Los UUID usados en otros recuentos se rechazan. El borrador queda en el dispositivo hasta confirmar el guardado. La tabla tiene RLS, sin permisos directos para usuarios; solo las funciones autorizadas permiten consultar o guardar.

El trabajador existente publica un único asiento conjunto con documento adjunto en **📈・ventas-potenciales**, dentro de **🎩 Dirección**. Los eventos intermedios de inventario/caja quedan como actualizaciones de tablero sin nuevos mensajes en ese canal. Los cierres cuadrados conservan además su publicación habitual en el canal de caja. La cola funciona cada minuto y reintenta los fallos con recuperación del identificador de mensaje.

Verificación: `node test-comprobar-negocio-sql.cjs`, `node --test test-comprobar-negocio-ui.cjs test-hacer-caja-ui.cjs`. Cubren autorización, caja real, NPC, recuentos parciales, versiones concurrentes, atomicidad, historia por artículo e idempotencia.
