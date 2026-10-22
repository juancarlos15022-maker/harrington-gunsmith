# Señor Whitmore · bot del gobierno (22/10/2026)

Bot de Discord aparte del Señor Harrington y de la web de la armería. Solo para el Consejo de Gobierno
(categoría privada «Consejo de Gobierno» del servidor). No lee ni escribe nada de la web.

- Función: `supabase/functions/discord-whitmore` (index.ts, gob.ts, comandos.ts, web.ts). Interactions Endpoint URL apuntada a ella.
- Configuración: tabla `whitmore_cfg` (ids de canales y roles, firma, elecciones, token). Datos: `gob_registros`, `gob_votos`.
  Registro de llamadas a Discord y errores: `whitmore_registro` (solo se añaden filas).
- Avisos: tarea programada `whitmore-avisos` cada minuto (citas/reuniones/actos una hora antes, tareas el día del plazo,
  resumen a las 9:00 en #agenda-y-reuniones, informe de cuentas los domingos a las 21:00 en #economía).

## Roles
🎩 Gobernador (firma documentos, acepta/rechaza audiencias, cierra votaciones, cambia la firma) ·
📅 Secretaría de Gobernación · 💰 Secretaría de Economía y Comercio (cuentas) · Consejo de Gobierno (todo lo demás).
Las órdenes solo responden a quien tenga alguno de esos roles (o sea administrador del servidor).

## Canales
💡 propuestas · 💬 chat-del-equipo · 📁 documentos · 📅 agenda-y-reuniones · 🔊 Reunión de gobierno ·
📨 telegramas · 💰 economía · 📋 tareas · 🗳️ campaña (estos cuatro, nuevos; mismos permisos que la categoría).
🌐・web-del-gobierno (22/10/2026; solo lectura, como 📜・comandos-del-sr-whitmore): mensaje fijado del Sr. Whitmore con el botón
«Abrir la web del gobierno» y cómo entrar (/acceso la primera vez; 30 días recordado). Id en `whitmore_cfg.canal_web`.

## Órdenes
/whitmore · /cita nueva|hoy|semana|cancelar · /audiencia nueva|pendientes · /reunion nueva|proximas (Asistiré / No podré / Escribir acta) ·
/acto nuevo|proximos · /telegrama recibido|redactar|lista (botón Redactar respuesta) · /decreto nuevo|lista (decreto, comunicado o carta;
Firmar / Editar / Descartar; numeración propia de cada clase al firmar) · /propuesta nueva|abiertas (A favor / En contra / Cerrar) ·
/programa [publicar] · /tarea nueva|lista (botón Hecha) · /contacto nuevo|buscar|lista · /negocio nuevo|buscar|lista ·
/cuenta ingreso|gasto|saldo · /elecciones fijar|ver · /resumen · /firma cargo [nombre] · /acceso (enlace a la web).

Control desde el servidor: `{secreto, ops}` (llamadas a Discord), `{secreto, registrar:true}` (vuelve a registrar las órdenes),
`{secreto, cron:true}` (revisión de avisos).

## Web del Gobierno de Silver Peak (22/10/2026)
`gobierno/` (index.html, gob.css, gob.js, escudo.svg), publicada en GitHub Pages:
https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/ · aparte de la web de la armería
(el service worker de la armería no toca esa carpeta; no comparte sesión ni datos con ella).

- Entrada: `/acceso` en Discord → botón personal (un solo uso, 10 minutos; en `gob_accesos` solo se guarda el hash).
  La web lo cambia por una sesión de 30 días (`gob_sesiones`, también con hash). Sin contraseñas.
- Cada 10 minutos se vuelven a mirar los roles en Discord; si alguien pierde el rol del Consejo, se cierran todas sus sesiones.
- Secciones: Despacho (elecciones, por firmar, audiencias, saldo para Economía/gobernador, próximos días, decisiones,
  propuestas y tareas) · Agenda semanal (citas y audiencias) · Documentos (editor con vista de pergamino, firma del
  gobernador, descarga en PNG) · Telegramas (recibidos, redactar con firma, responder).
- Todo lo que se hace en la web se publica o actualiza en los canales de Discord igual que con las órdenes.
- Servidor: la misma función, cuerpo `{web:true, accion, sesion, …}`; CORS solo para juancarlos15022-maker.github.io.
- Lugar: Gobierno de Silver Peak (no Saint Denis). Firma «cargo · Silver Peak»; documentos «Dado en Silver Peak».

### Aspecto «despacho» (22/10/2026, gob.css v2)
Madera de fondo, menú de cuero verde con canto de latón, cabeceras con escena por sección, botones de latón,
agenda en papel rayado, documentos en pergamino con esquinas de ornamento y lacre, telegramas en papel con tipografía
de máquina, nota diaria del Sr. Whitmore en el Despacho y dibujos en los apartados vacíos.
Imágenes en `gobierno/img/` (copias reducidas, **recicladas de la web de Harrington y provisionales**; se cambian por
imágenes propias sin tocar la armería): madera, cuero, latón, papel, pergamino ← texturas de la armería ·
cab-despacho ← whitmore-banner · cab-agenda ← escena-agenda · cab-documentos ← fondo-carga · cab-telegramas ← escena-discord ·
whitmore ← whitmore-avatar · marco-ovalado · esq-si/sd/ii/id ← esquina-ornamento · separador ← separador-ornamento ·
i-reloj ← reloj-bolsillo · i-pluma ← dc-libro · i-llave ← dc-llave · i-moneda ← moneda-oro · i-calendario ← dc-calendario ·
i-pergamino ← dc-pergamino · i-telegrafo ← icono-telegrafo · i-sobre / i-sobre-abierto ← sobre-cerrado / sobre-abierto ·
v-telegrafo ← vacio-avisos · v-pergamino ← vacio-encargos · i-reloj2 ← dc-reloj (sin usar aún).

## Secretarías y expedientes (22/10/2026)
Economía, Comercio, Justicia y Seguridad, accesibles en `#secretarias`. Cada área incluye clases de expediente propias y libros comunes de correspondencia, encargos, compromisos, directorio, actas y relevo. El Consejo consulta los libros; solo el titular del área o el Gobernador los modifica.

El Gobernador distribuye competencias desde cada Secretaría: puede asumirlas, delegarlas a varios miembros verificados del Consejo o conservar el cargo existente de Economía y Comercio para esas dos áreas. Las encomiendas se guardan en `whitmore_cfg.competencia_*` y se comprueban de nuevo en cada operación.

Los escritos se elevan a Documentos y aparecen en el Despacho para firma. La remisión, devolución y ejecución son transacciones con bloqueo y versión del expediente. Un escrito elevado solo puede enmendarlo el Gobernador; si lo devuelve, la Secretaría prepara la nueva versión. El historial conserva las actuaciones y el expediente enlaza con su documento.

Presupuestos, ingresos, gastos, licencias, convenios, disposiciones y órdenes requieren firma. Firmar autoriza; ejecutar un pago o ingreso exige un justificante y crea un único movimiento en las cuentas ya existentes. El parte del Despacho reúne los plazos pendientes y los libros admiten búsqueda, filtro y consulta de asientos anteriores.

Servidor: `secretarias.ts`, acciones `secretarias*`. Las funciones SQL `gob_secretaria_asentar`, `gob_secretaria_cuentas` y `gob_secretaria_resumen` son invocables solo por service_role. No conceden roles de Discord ni designan automáticamente a nuevos secretarios.
