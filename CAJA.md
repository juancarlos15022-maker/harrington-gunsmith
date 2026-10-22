# Hacer caja · Harrington Gunsmith

La acción de la pantalla principal está disponible únicamente para cuentas vigentes de jefe, con Dirección encendida o apagada. La misma comprobación se ejecuta en el servidor. El apartado antiguo de cierre conduce al nuevo circuito y conserva sus documentos anteriores.

Antes del primer recuento, el saldo parte de los **190 dólares iniciales** más cobros menos salidas de efectivo. Después, cada importe contado y guardado es la nueva base real: último contado + variación de cobros − variación de salidas desde ese recuento. El histórico conserva el esperado anterior y la diferencia, sin convertirla en venta o gasto. Los anticipos de encargos y el cobro de entrega se contabilizan por separado, sin sumar otra vez el precio entero. Ventas anuladas y costes marcados `sinSalidaCaja` se muestran en el libro, pero no alteran el efectivo. Se incluyen los gastos de proveedor, nóminas, devoluciones y otros que estén registrados; no se vuelven a restar los pedidos pagados si su pago ya originó un gasto.

Un recuento puede hacerse en cualquier momento. Al comprobar y guardar, si coincide al céntimo se cierra y se encola su publicación. Si no coincide queda pendiente; un faltante admite hasta veinte conceptos de gastos reales aún no registrados, con confirmación expresa. Se pueden justificar parcialmente y conservar la diferencia restante. Un sobrante no admite gastos para disimularlo. Los gastos añadidos se registran con fecha de anotación, autor y referencia del recuento.

Cada recuento conserva un libro completo de ese momento y puede descargarse. Cada recuento actualiza la base real, incluso si hubo diferencia. No altera el fondo histórico inicial ni borra la diferencia. Los registros nuevos se protegen contra escrituras directas; no forman parte del borrado de cierres antiguos. Las ventas y gastos originales conservan sus herramientas de gestión; una corrección posterior se reflejará en el siguiente recuento, mientras que el cierre histórico conservará su fotografía original.

El guardado usa una versión del libro y bloqueo transaccional frente a cambios de ventas/gastos. Si las cuentas cambian durante el recuento, exige actualizar y revisar. Los reintentos de una respuesta perdida usan el mismo identificador para no duplicar gastos. El dispositivo tampoco permite cerrar con ventas o gastos locales pendientes de sincronizar.

Discord reutiliza el canal privado **💰・cierre-de-caja** (`1520882256175042752`). Publica solo cierres cuadrados, con resumen y libro completo adjunto. El envío se confirma con el identificador real del mensaje. Un fallo queda pendiente y se reintenta cada minuto; la interfaz no lo da por publicado antes de confirmarlo.

Pruebas: `node test-caja-base-real.cjs` y `node test-caja-acumulada.cjs`; `node --experimental-strip-types --test test-hacer-caja-ui.cjs test-caja-informe.mjs`. Dependencias de prueba declaradas en `package.json`.

Corrección: el recuento ya guardado de $424.00 pasa a ser la base real; el esperado de $416.51 y el sobrante de $7.49 se mantienen en su registro histórico.
