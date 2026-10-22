# Hacienda de Silver Peak — 1880

El Consejo consulta los libros; Economía o el Gobernador los gestiona. Comercio también administra el registro empresarial. Las competencias delegadas se comprueban en cada operación.

La web es independiente del servidor del juego. Los impuestos se recaudan automáticamente allí. Aquí se registra el saldo comprobado, su distribución y los movimientos que el equipo confirma. No se cobran impuestos a ciudadanos desde esta web.

## Recorrido
1. Arqueo de Tesorería: introducir el dinero total disponible. Solo el importe es obligatorio. Cada nuevo arqueo conserva el saldo anterior, el nuevo y la diferencia, sin clasificarla como ingreso o gasto.
2. Fondo de reparto: proponer un presupuesto para firma del Gobernador.
3. Alcaldías: registrar localidades y proponer asignaciones con destino y presupuesto.
4. Dotaciones: establecer sueldos de Gobernador, Secretarios, Alcaldes y Sheriffs; las revisiones no sustituyen a la resolución vigente hasta su firma. No se incorpora el pago de médicos.
5. Nóminas: preparar cada periodo desde una dotación firmada. No se duplica una persona/cargo/periodo al cambiar de resolución.
6. Movimientos: preparar ingresos comprobados, otros pagos o transferencias indicando concepto, importe, procedencia y destinatario. La firma autoriza. Confirmar la ejecución cuando el dinero se haya movido crea un asiento y aplica el importe a los fondos de referencia.

Las transferencias de salida dejan de pertenecer a los fondos del Gobierno. Los campos de origen y destino identifican a la contraparte; no son subcuentas bancarias conectadas al juego.

## Controles
- Importes enteros en centavos, bloqueo transaccional de tesorería y presupuestos; pago único por expediente.
- No se permite pagar sin firma, sin arqueo o dejando fondos negativos.
- Un asiento efectuado no se edita ni se borra. Las copias y reintentos de Discord pueden actualizar solo sus metadatos.
- El escrito de Hacienda conserva el importe y destinatario de la propuesta; para corregirla se descarta y se eleva otra.
- El libro de movimientos incluye todos los asientos y arqueos, con búsqueda, fechas, paginación y descarga CSV completa de la consulta. Los asientos antiguos que carezcan de detalle lo indican.
- Un nuevo arqueo es una comprobación del saldo, no un ingreso adicional. Sus diferencias se muestran para justificar: no se atribuyen a impuestos automáticamente.

## Discord
Canal privado cuentas-del-gobierno, dentro de Consejo de Gobierno, lectura para el Consejo y publicación por Whitmore.
Panel con fondos de referencia, autorizado pendiente de pago y últimas constancias; un mensaje por movimiento o arqueo y cierres diarios inmutables, desde el primer arqueo.
Las escrituras en la web intentan actualizar la copia inmediatamente. El cron de Whitmore revisa cada minuto y reintenta fallos. No es una conexión en tiempo real con el juego.
Los cierres del día anterior se preparan tras medianoche, hora de Madrid, y se recuperan días pendientes si hubo interrupciones. Las fechas se presentan con día y mes real y año 1880.

## Validación
Pruebas SQL locales con PGlite, permisos y fechas del servidor, seis vistas con jsdom y comprobación visual de escritorio y móvil. Sin datos financieros ficticios en producción.
