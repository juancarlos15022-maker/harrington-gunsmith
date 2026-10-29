# Parche de fluidez · 29/10/2026

- Complementos `defer` en el mismo orden: las descargas pueden solaparse sin cambiar dependencias.
- Cuatro hojas locales de estilo reunidas en una, conservando el orden de la cascada y el estilo del recuento conjunto.
- Centrado de la entrada mediante cambios de estado, resize, fuentes e imágenes. Sin bucle de fotogramas permanente.
- Historial: HTML diferido y memorizado por fila, 50 filas iniciales; búsqueda sobre los mismos 600 registros y botón Ver más.
- Dirección: deserialización compartida dentro de cada render síncrono. Arrays independientes, invalidación si cambia el almacenamiento y liberación al terminar. No se cachean operaciones de stock ni escrituras.
- Sondeos sin cambios: mantenimiento como máximo cada minuto; cambios reales y refrescos forzados lo ejecutan de inmediato. Se conservan Realtime, lectura de stock y confirmaciones.
- Primer historial antiguo: hasta tres categorías independientes en paralelo, conservando paginación y filtros.
- Vídeos con precarga de metadatos; entrada completa por intención del usuario, sin descarga especulativa de salida. La animación de puertas existente sigue siendo el respaldo.
- Navegación con copia local: espera máxima por la red reducida de 1.500 a 250 ms; revalidación en segundo plano.

## Medición reproducible

`node benchmark-fluidez.cjs` compara con `ca21d023190f6656a257e8328f05cd9700e0182b`.
Escenario sintético: 2.500 ventas, 500 turnos, 10 empleados. Ejecución Node/JSDOM, no medición del dispositivo del usuario.
En dos ejecuciones: Dirección 51–70 ms antes y 33–40 ms después; 17 lecturas JSON por apertura frente a 7. Historial: 600 filas HTML preparadas frente a 50, manteniendo la búsqueda completa. Los tiempos dependen del equipo y no representan la carga de red total.

## Validación

- 55 pruebas existentes de rendimiento/interfaz: pasan.
- 5 pruebas nuevas de centrado, historial, aislamiento de lecturas, carga y sincronización: pasan.
- 25 pruebas de inventario, jefes, reposición y proveedores: pasan.
- Suite general: 191 de 197 pasan. Las otras seis fallan también con el código previo exacto: una prueba DOM antigua de inventario NPC y cinco pruebas antiguas de reset de claves (`esDirector` ausente en sus mocks). No se cambian los permisos ni esos flujos.
- Navegador de previsualización: portada, búsqueda, entrada y tarjetas visibles; sin errores propios de JavaScript. No se introducen contraseñas ni se crean cuentas para la prueba.
