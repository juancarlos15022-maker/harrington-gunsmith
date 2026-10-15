# Almacén propio y NPC · 15 de octubre de 2026

`stock.cantidad` conserva el total del negocio. `npc:estado.asig` indica cuántas de esas unidades están físicamente en el NPC; no se suma otra vez al stock. Almacén propio = total menos NPC.

## Dirección → Tienda → NPC

- **Entregar al NPC** y **Recuperar al almacén** trasladan cantidades sin cambiar el total ni generar ingresos.
- **Revisar ventas del NPC** compara lo esperado con lo contado después de todas las ventas manuales, traslados y consumos registrados. Solo la diferencia pendiente es una venta del NPC.
- **Hacer inventario del NPC** corrige su ubicación y el total por diferencia, conserva el almacén propio y no genera ingresos.
- **Retirar para consumo** descuenta existencias del NPC y del total sin crear una venta.
- **Precios del NPC** mantiene precios específicos en centavos (la interfaz permite introducir dólares).

Se eliminan el botón de recuento opcional y el botón de revisión NPC del panel de avisos. El aviso pendiente remite al apartado de Dirección, donde están las dos acciones diferenciadas.

## Venta normal

El servidor consume primero el almacén propio y después reduce la asignación al NPC. Solo se fabrica lo que falte al agotar las dos ubicaciones. Esta reducción se guarda en la misma transacción que el movimiento y la venta. La siguiente revisión del NPC parte de la asignación ya reducida y no vuelve a contabilizar esas unidades.

Ejemplo verificado: NPC con 10 cajas, venta manual de 3 tomada del NPC, recuento físico de 5. Quedan 7 esperadas antes de revisar: se registran solo 2 ventas del NPC y el total termina en 5.

## Inventario propio

HACER INVENTARIO ahora pide exclusivamente el almacén propio y muestra almacén, NPC y total. Lo contado se suma a la asignación NPC vigente al confirmar. Se comprueban las versiones de ambas ubicaciones; un traslado ocurrido mientras se cuenta bloquea el guardado y obliga a revisar. Las páginas antiguas que intentan ajustar un total contando solo almacén se rechazan cuando hay unidades en NPC.

## Integridad y pruebas

Las operaciones de NPC son transacciones con control de versiones, validación, autorización por cuenta y peticiones idempotentes. Los trabajadores pueden revisar ventas; inventarios, traslados, precios y consumos requieren un jefe. Las RPC nuevas son SECURITY INVOKER y no están disponibles para anónimos. Se conservan los permisos y el modo de ejecución de las funciones anteriores.

Pruebas locales con Postgres WASM y DOM: traslados, consumo, inventarios separados, venta manual, fabricación parcial, revisión sin doble descuento, conflictos, reintentos, reversión completa por fallo de registro y RLS con rol authenticated. `npm ci && npm test`. No se han registrado movimientos comerciales ni enviado mensajes reales a Discord para probar.

Los registros históricos se conservan. No se convierten recuentos antiguos en ventas ni se reponen cantidades por suposición. Las unidades físicamente trasladadas antes de este cambio deben estar asignadas al NPC mediante **Entregar al NPC**, una vez comprobado que ya forman parte del total.

## Respaldo

Código previo: `backup/antes-almacenes-npc-2026-10-15`, commit `a6d90309d8b6d29807e8eecf12e9cdfda650fcc1`. Se conservan las definiciones anteriores de las funciones SQL modificadas para una reversión coordinada. No eliminar registros de idempotencia mientras pueda haber peticiones pendientes.
