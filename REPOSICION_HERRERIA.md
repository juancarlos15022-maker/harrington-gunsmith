# Reposición automática de herrería

Se revisa cada minuto en el servidor, aunque la web esté cerrada. Proveedor configurado: ficha de Herrería de Saint Denis (telegrama SD3214). La cuenta privada de destino se obtiene de la vinculación verificada del propietario y se comprueba antes de crear y enviar.

Mínimos: 10 cañones y 10 culatas de cada familia (rifle, repetidora, escopeta, pistola y revólver), 400 tornillos, 60 piezas normales, 20 piezas especiales y 10 barras de hierro. Se muestran y editan con los mínimos existentes del almacén (`stockmin`).

Cantidad a pedir = máximo de cero y mínimo menos existencias menos cantidad pendiente de recibir en pedidos activos. Se tienen en cuenta recepciones parciales y pedidos pagados aún en camino; no cuentan los cancelados, eliminados, completados o ya recibidos. Se agrupan en un pedido nuevo los materiales que necesitan reposición; no se modifican pedidos anteriores que ya pudieran haberse comunicado al proveedor.

La creación del pedido y el aviso privado se guardan en una sola transacción. Un bloqueo evita duplicados entre revisiones simultáneas. Sin proveedor, precio o destinatario verificado, la transacción no genera un pedido incompleto. El pedido se crea sin pagar y sin recibir: no mueve stock ni genera gastos. Se procesa con los controles de recepción y pago existentes.

El aviso privado contiene el telegrama preparado para copiar y enviar al proveedor. No se envía al proveedor. Si los privados están cerrados, conserva el pedido y reintenta el aviso; no afirma que se haya entregado. Utiliza referencia persistente, reserva, nonce y recuperación del mensaje para evitar repetir envíos tras respuestas perdidas.

Los materiales se guardan como `Cañon de …`, sin tilde en la o. Las formas con tilde y sin tilde se reconocen como el mismo material al introducir proveedores y recibir o fabricar. La migración conserva la suma de las existencias, actualiza recetas y fichas y mantiene intactos los documentos históricos. El producto `Doble Cañón Escopeta` conserva su nombre.

Archivos: `reposicion-herreria.sql` define funciones y cola privada; `reposicion-configurar.sql` normaliza datos y configura los mínimos; `reposicion-programar.sql` instala el trabajo por minuto; `supabase/functions/harrington-reposicion` procesa el pedido y su aviso. La función HTTP requiere el secreto interno del bot; no usa una contraseña pública ni expone el token de Discord.

Pruebas: `npm run test:reposicion`. Incluyen reposición exacta, idempotencia, pendientes, recepciones parciales, precios ausentes, identidad de destino, reconocimiento de nombres, envío confirmado, privados cerrados y recuperación de envíos. No se realizan ventas, pagos ni recepciones reales para probar.

## Propuestas (20/10/2026)

Los pedidos automáticos de herrería y mina nacen como **propuesta** (`propuesta:true`). Mientras no se aceptan, cada revisión de un minuto los ajusta: en herrería la cantidad de cada material vuelve a ser `mínimo − existencias − pendiente de otros pedidos` (si ya no falta nada, la propuesta se anula sola con `propuestaCerrada:'sin-faltas'`); en mina los materiales nuevos bajo el umbral se añaden a la propuesta abierta. Cada cambio sube `version` en `hg_reposicion_avisos` y `harrington-reposicion` edita el privado y la tarjeta del canal de pedidos (`bot_pedmsg`).

El privado lleva un botón de enlace «Aceptar propuesta» a `aceptar.html?t=<token>` (64 hex, único por aviso). La página llama a `harrington-reposicion` con `{accion:'aceptar',token}`; `hg_reposicion_aceptar` bloquea el pedido (`propuesta:false`, `aceptadoAt`, `aceptadoPor`), lo apunta en el historial y marca el telegrama IC como pendiente. El servidor envía al privado el telegrama de Vincent Harrington para el proveedor (sin número de pedido, precios ni referencias) y la página lo muestra con un botón de copiar. El telegrama pide que se lo traigan a la armería y se paga al recibirlo. Una propuesta deja de serlo también si se paga, se recibe (aunque sea en parte), se abona o se cancela.

Archivos: `reposicion-propuestas.sql`, `aceptar.html`, `aceptar.js`. Pruebas: `test-reposicion-propuestas.cjs`.
