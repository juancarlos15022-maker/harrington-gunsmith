# Optimización de procesos · 20/10/2026

Base de comparación: 03c17d4ed87459524b269f196f138ae5e8da2a39 (ya incluye el parche anterior).

Se conservan las imágenes, vídeos, sonidos, animaciones, estilos, controles y funciones. No se modifican las frecuencias de sincronización, el servidor, los permisos, las escrituras ni las confirmaciones de las operaciones.

## Cambios

- Los precios especiales se buscan una vez por recorrido del catálogo, sin retenerlos para operaciones posteriores. Cambiar cliente, precios o encargo se refleja en la siguiente lectura.
- La selección no calcula precios ni crea objetos para productos con cantidad cero.
- El recálculo del ticket reutiliza los totales obtenidos en su propio recorrido; las comprobaciones independientes de confirmación siguen recalculando desde el estado actual.
- Las lecturas GET idénticas de tablas REST que coinciden mientras esperan cabeceras comparten una petición. Cada lector recibe una respuesta independiente. Se separan por credencial, ruta y cabeceras; no se guardan resultados para consultas posteriores. Señales de cancelación, opciones especiales y RPC quedan excluidos. Las escrituras invalidan las lecturas compartidas al comenzar y terminar. Los errores liberan la consulta; las comprobaciones de sesión y renovación tras 401 siguen activas. El registro tiene un límite de 128 consultas simultáneas.

## Medición reproducible

Node/JSDOM, sin red ni temporizadores, 15 calentamientos y mediana de 5 lotes de 80 operaciones. Los números no representan carga real del navegador, FPS, INP ni latencia de Discord/Supabase.

| Escenario | Antes | Después | Reducción de tiempo |
| --- | ---: | ---: | ---: |
| Recálculo, carrito vacío | 2,637 ms | 1,661 ms | 37,0 % |
| Recálculo, 200 clientes y 8 productos seleccionados | 14,363 ms | 2,324 ms | 83,8 % |
| Selección en ese escenario | 2,499 ms | 0,106 ms | 95,8 % |
| Desglose económico en ese escenario | 0,556 ms | 0,104 ms | 81,3 % |

El escenario de 200 clientes es sintético: el coste depende de los datos del dispositivo y la posición del cliente en la lista. No implica una mejora global del 50–80 % ni acredita ese objetivo en todos los procesos. El benchmark cliente usa presupuesto para no realizar ventas ni consumir stock.

Prueba de comunicaciones simulada: diez GET idénticos simultáneos generan una petición en lugar de diez; los diez lectores consumen su respuesta. Esto mide peticiones evitadas en esa coincidencia, no una reducción del 90 % en el tráfico real.

Ejecutar `npm run benchmark:catalogo`, o `HG_BENCH_SCENARIO=cliente npm run benchmark:procesos`. `HG_CALC_SOURCE` permite comparar con una copia de app.js anterior. No se incluyen copias completas de la aplicación en el repositorio.

## Verificación

Pruebas funcionales de ventas, precios, descuentos, cambio de cliente, fianzas, inventario, proveedores, fabricación, lazos, permisos, almacén, imágenes y observadores. Pruebas nuevas de lecturas simultáneas, filtros, cabeceras, identidades, escrituras concurrentes, reintentos, cancelación independiente, renovación tras 401 y respuesta de cuenta anterior. No se envían mensajes de prueba a Discord ni se crean operaciones reales para medir.

No se ha verificado rendimiento visual en un navegador real en esta ejecución. El porcentaje global solicitado sigue sin estar demostrado.
