# Editar y ampliar pedidos

En PEDIDOS, al abrir un pedido aceptado que sigue pendiente de recibir, cualquier jefe ve «EDITAR / AMPLIAR PEDIDO», sin necesitar activar el modo Dirección. La función está protegida también en el servidor: un empleado ordinario no puede preparar ni guardar una edición.

El formulario permite cambiar cantidades totales, añadir materiales, quitar líneas no recibidas y ajustar sus precios. Calcula subtotales, nuevo total y pendiente después de abonos. Las líneas recibidas conservan su material, precio y cantidad recibida; no pueden eliminarse ni reducirse por debajo de lo recibido. Se conservan las entregas y responsables anteriores. Un material nuevo se normaliza con el mismo catálogo de recepción de pedidos, y si ya está presente se pide ampliar su línea en lugar de duplicarla.

Un pedido ya pagado que aumenta conserva el importe anterior como `abonoCents`. Deja de figurar totalmente pagado y se permite registrar el pago del resto. No se vuelve a registrar el abono ni se modifican existencias al editar. No permite reducir el total por debajo del dinero abonado. Pedidos completamente recibidos, completados, cancelados, con resto cancelado y propuestas todavía sin aceptar no se editan por este circuito.

`hg_pedido_editar_preparar` y `hg_pedido_editar_guardar` usan versión del registro completo, validación de jefe vigente y guardado transaccional. Una recepción, pago o edición concurrente impide sobrescribir el nuevo estado. Cada intento conserva UUID y huella; recuperar una respuesta perdida no repite cambios. La tabla privada `hg_pedido_ediciones` guarda antes/después, responsable, fecha y motivo; el registro de actividad añade la referencia. El formulario muestra las últimas 30 ediciones.

El pedido mantiene su identificador. El disparador de albaranes ya existente captura el cambio y conserva el identificador del mensaje en Discord: el trabajador actualiza ese mismo mensaje y su imagen, así como el albarán automático del privado cuando existe. La página de albaranes lee el pedido actualizado y genera la misma plantilla, ahora con fecha, autor y motivo de la última edición. El envío a Discord se reintenta automáticamente, normalmente en la revisión del siguiente minuto.

Pruebas: `node test-editar-pedido-sql.cjs` y `node --test test-editar-pedido-ui.cjs`. Cubren los dos jefes, denegación a empleados, recálculo, abonos, material recibido, protección frente a versiones concurrentes, recuperación idempotente, auditoría y actualización de la cola del albarán.

La recepción comprueba también el número de edición del formulario abierto. Si el pedido cambia durante una entrega, se rechaza antes de sumar stock y hay que revisar la versión vigente. Los formularios abiertos se reinician al detectar otra edición. Las páginas antiguas deben recargarse para recibir pedidos modificados; los pedidos sin editar conservan su compatibilidad. Prueba adicional: `node test-editar-recepcion.cjs`.
