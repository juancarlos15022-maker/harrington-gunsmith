# Rendimiento · 20 de octubre de 2026

Parche sobre d481447e85091bdce60460a3399f767c89a266ed. Se conservan imágenes, vídeos, efectos y confirmación de las operaciones por servidor.

## Cambios
- Catálogo: reutiliza referencias a controles y precios; detecta los accesos rápidos añadidos posteriormente y evita escrituras si el valor visible no cambia.
- Formato de importes y hora de Madrid: cachés limitadas (256 importes / 128 minutos), sin compartir objetos de fecha modificables.
- Efectos: los observadores revisan las zonas afectadas; los cambios de cantidades no disparan recorridos completos de la página. Cancela la luz pendiente al salir del catálogo.
- Imágenes decorativas: decodificación asíncrona, prioridad baja, inicio en tiempo libre y un máximo de dos cargas simultáneas. Los recibos comparten la carga del emblema, con reintento y espera máxima.
- Caché persistente de imágenes y fuentes separada del código. Las imágenes usan su huella del repositorio. Al cambiar de versión se valida el ETag una vez para detectar sustituciones con el mismo nombre incluso si una futura edición no regenera el manifiesto. Si CacheStorage falla, se usa la red. No se cachean peticiones autenticadas.
- Animaciones pausadas en pestañas ocultas y cabecera pausada mientras la entrada la tapa.

## Medición reproducible
Prueba sintética en Node/JSDOM con 43 productos, modo presupuesto, 15 pasadas de calentamiento y cinco muestras de 80 recálculos. Incluye rendimiento-interfaz.js en ambas versiones.
- Mediana anterior: 6,437 ms por recálculo.
- Mediana con el parche: 2,504 ms (61,1 % menos).
- Búsquedas DOM contadas: 68.800 → 17.200 en 400 recálculos.
- Mutaciones contadas en el contenedor del pedido: 800 → 400.
- Veinte actualizaciones del carrito: consultas globales a body de los efectos 140 → 0.

Estas cifras no miden la conexión, el primer arranque real ni un teléfono físico. El rendimiento percibido depende del dispositivo, de las imágenes visibles y de la red.

Comandos:
- npm run test:performance
- npm run benchmark:catalogo
- Para comparar otra fuente del archivo principal: HG_CALC_SOURCE=/ruta/al/app-anterior.js npm run benchmark:catalogo

Se verifican ventas y confirmaciones, descuentos, reservas, fabricación, recepción de pedidos, inventario, respuestas perdidas, cambios de cuenta, caché de medios y fechas durante el cambio de hora. Las pruebas de inventario ahora simulan una sesión autenticada y usan una identidad que no es el director para la prueba de empleado.

El navegador de pruebas local no pudo instalarse (descarga de Chromium truncada); no se atribuyen a este parche mejoras de carga de navegador que no se hayan medido.
