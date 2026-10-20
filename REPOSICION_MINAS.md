# Reposición automática de minería

Todos los pedidos automáticos de minería se hacen a la ficha de Roanoke Mining Company (Annesburg, telegrama ER6080). Se siguen permitiendo pedidos manuales a cualquier otra mina. La revisión se integra en el trabajo de reposición existente, cada minuto y aunque la web esté cerrada.

Materiales: Hierro (también Mena de hierro), Carbón (también Mena de carbón), Sal, Azufre y Piedra. Umbral inicial: 100 unidades de cada uno. Si las existencias están por debajo del umbral, y las existencias más lo pendiente de entrega no llegan a cubrirlo, se piden exactamente 200 unidades de ese material. Los distintos materiales afectados se agrupan en un pedido nuevo de Roanoke. En 100 no se activa; en 99 sin nada pendiente se piden 200, no una unidad.

Se consultan pedidos activos de todas las minas, incluidos los manuales, los ya pagados y las recepciones parciales. Solo cuenta la cantidad que queda por recibir. No cuentan cancelados, completados, eliminados o recibidos. Por eso una falta cubierta por un pedido en camino no genera otro pedido.

Los pedidos nuevos quedan sin pagar y sin recibir. Se usa la cola privada ya existente, con configuración y destinatario verificado por tipo de reposición. La entrega del telegrama se confirma tras recibir el ID de Discord; los fallos no eliminan el pedido. No se ha cambiado el diseño de la web.

La unificación solicitada de los dos pedidos existentes conserva el pedido de Roanoke, cancela el de Strawberry y conserva el historial. Los materiales añadidos usan los precios de Roanoke. Se conserva el abono previo de 170 dólares, se añade mercancía por 68 dólares y el total queda en 238 dólares. No se registra como pagada la ampliación. La nota del albarán muestra el abono y lo pendiente. La cancelación posterior conserva cualquier abono para su liquidación; marcar todo pagado y recibido utiliza el gasto final normal del pedido, sin duplicarlo.

El telegrama de unificación es una ampliación del pedido existente, no otro encargo de las cantidades originales. La operación tiene protección frente a repetición y no modifica existencias ni genera un pago nuevo.

Pruebas: `npm run test:reposicion`. Se comprueban umbral, lote fijo, agrupación, pedidos de distintas minas, recepciones parciales, cancelados, idempotencia, crédito previo y liquidación, configuración de destino y reintentos de privados.
