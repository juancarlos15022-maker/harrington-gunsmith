# Señor Whitmore · bot del gobierno (22/10/2026)

Bot de Discord aparte del Señor Harrington y de la web de la armería. Solo para el Consejo de Gobierno
(categoría privada «Consejo de Gobierno» del servidor). No lee ni escribe nada de la web.

- Función: `supabase/functions/discord-whitmore` (index.ts, gob.ts, comandos.ts). Interactions Endpoint URL apuntada a ella.
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

## Órdenes
/whitmore · /cita nueva|hoy|semana|cancelar · /audiencia nueva|pendientes · /reunion nueva|proximas (Asistiré / No podré / Escribir acta) ·
/acto nuevo|proximos · /telegrama recibido|redactar|lista (botón Redactar respuesta) · /decreto nuevo|lista (decreto, comunicado o carta;
Firmar / Editar / Descartar; numeración propia de cada clase al firmar) · /propuesta nueva|abiertas (A favor / En contra / Cerrar) ·
/programa [publicar] · /tarea nueva|lista (botón Hecha) · /contacto nuevo|buscar|lista · /negocio nuevo|buscar|lista ·
/cuenta ingreso|gasto|saldo · /elecciones fijar|ver · /resumen · /firma cargo [nombre].

Control desde el servidor: `{secreto, ops}` (llamadas a Discord), `{secreto, registrar:true}` (vuelve a registrar las órdenes),
`{secreto, cron:true}` (revisión de avisos).
