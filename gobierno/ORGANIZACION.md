# Sede republicana y archivo oficial

La web mantiene el acceso privado mediante Discord. El Consejo trabaja en la web; Whitmore publica los escritos y sus cambios en los libros correspondientes.

| Bloque | Canal | Uso |
| --- | --- | --- |
| Sede | Sede y acceso | Enlace a la web y acceso personal con `/acceso` |
| Sede | Guía de Whitmore | Órdenes y orientación |
| Sede | Chat, campaña, agenda, telegramas, propuestas y tareas | Coordinación del equipo |
| Secretarías | Economía y presupuestos | Expedientes y documentos de Economía |
| Secretarías | Comercio y licencias | Expedientes y documentos de Comercio |
| Secretarías | Justicia y disposiciones | Expedientes y documentos de Justicia |
| Secretarías | Seguridad y órdenes | Expedientes y documentos de Seguridad |
| Archivo oficial | Mesa de firmas | Revisión, firma y descarte de borradores |
| Archivo oficial | Registro oficial | Copias de documentos firmados y numerados |
| Archivo oficial | Actas y acuerdos | Actas de las reuniones |
| Archivo oficial | Seguimiento de trámites | Constancia cronológica de cambios y actuaciones |
| Archivo oficial | Cuentas del gobierno | Arqueos, movimientos confirmados y cierres |

Los canales existentes conservan su historial. Las nuevas categorías y canales mantienen el acceso privado del Consejo. Los archivos automáticos son de lectura para el Consejo; las actuaciones se realizan desde la web o los controles de Whitmore.

## Recorrido de los escritos

1. Se abre el expediente en su Secretaría.
2. Se prepara el borrador y se eleva a la mesa de firmas.
3. El Gobernador revisa y firma; el documento recibe su numeración.
4. La copia firmada se publica en el registro oficial y en el canal del área.
5. Cada modificación relevante deja una constancia en seguimiento, con el responsable que consta en la última actuación.
6. La ejecución de un pago sigue siendo una acción distinta de la autorización del documento.

La imagen de la rúbrica original de Vincent Harrington se muestra únicamente en documentos firmados por Vincent. Los borradores conservan la indicación de firma pendiente.

## Publicaciones y reintentos

`gob_difusion` guarda una instantánea de cada cambio relevante en la misma transacción que el registro. Los cambios de metadatos de Discord no generan nuevas publicaciones. El acceso a esta tabla está restringido al servidor.

La función `discord-whitmore` entrega los asientos en segundo plano y desde la revisión periódica existente, una vez por minuto. Una reserva temporal impide que dos trabajadores tomen el mismo envío a la vez; los errores quedan pendientes con demora progresiva. Se utiliza una nonce estable en Discord para reducir duplicados ante reintentos. La confirmación de entrega conserva canal, mensaje e instante de envío.

La web muestra el estado de la bandeja al entrar y al consultar el archivo. Los enlaces de los canales se obtienen del servidor; no se exponen credenciales en el cliente.

Las claves `canal_area_economia`, `canal_area_comercio`, `canal_area_justicia`, `canal_area_seguridad`, `canal_registro`, `canal_actas` y `canal_seguimiento` se guardan en `whitmore_cfg`. Los identificadores históricos de la mesa de firmas, cuentas y otros libros se conservan.

## Comprobaciones

- `node --experimental-strip-types --test test-gobierno-oficios.mjs`: membrete, firma por identidad, autor de la última actuación, concurrencia y reintentos.
- La migración `20261022093413_gobierno_publicaciones_por_area.sql` crea la bandeja y el disparador transaccional.
- El archivo de la web permite buscar entre los documentos cargados, filtrar por área y estado, y cargar escritos anteriores. Los enlaces directos también recuperan documentos antiguos fuera de la primera página.

## Bandeja y carpeta de expediente

La Bandeja de asuntos reúne los documentos, expedientes, telegramas, audiencias y encargos recientes cargados desde sus libros. Los separa en Por atender, Por firmar, En espera y Resueltos; cada acceso conserva los controles de su función original. Sus cantidades describen la selección cargada, no el total histórico.

Cada expediente dispone de pestañas para Antecedentes y gestión, Documentos, Actuaciones y Constancias. El cambio de pestaña oculta el panel sin reconstruir el formulario, para conservar lo escrito sin guardar. El recorrido y la siguiente acción se calculan a partir del estado y las competencias actuales.

Las constancias se consultan en el servidor para el expediente y el documento vinculado. Solo las entregas confirmadas muestran un enlace al mensaje de Discord; los errores internos no se devuelven al navegador. Esta consulta requiere la misma sesión privada del Consejo que el resto del despacho.

Pruebas adicionales: `node --test test-gobierno-carpetas.cjs` (requiere jsdom) y `node --experimental-strip-types --test test-gobierno-constancias.mjs`.
