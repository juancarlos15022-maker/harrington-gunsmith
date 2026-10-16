# Herramientas del equipo de Harrington

## Canales y uso

| Canal | Uso |
| --- | --- |
| Mesa del saloon | Veintiuno existente y nuevos dados y dominó entre dos empleados. |
| Ideas del taller | Propuestas con voto individual modificable y decisión razonada del dueño. |
| Manual del empleado | Instrucciones publicadas por el dueño, buscables y con fuente. |
| Libreta de dirección | Notas del dueño y recordatorios por privado, con alternativa en el canal privado. |

Comandos nuevos: `/saloon`, `/idea`, `/manual`, `/libreta`, `/avisame`, `/acuerdos` y el menú contextual de mensajes **Guardar como acuerdo**.

El buzón anónimo y el Veintiuno existentes se conservan. No se modifican las funciones de negocio de la web.

## Funcionamiento

- Dados: dos dados por jugador; vence quien gana dos rondas. Se muestran las tiradas cuando han tirado ambos.
- Dominó: doble seis, siete fichas por jugador, pozo, colocación a ambos extremos y cierre por menor suma. Mano privada y control de turnos. Invitaciones/partidas caducan al interactuar después de 24 horas.
- Ranking: victorias de dados y dominó de los últimos 30 días; sin apuestas ni dinero real o del juego.
- Ideas: voto único por empleado; solo el dueño puede aceptar, descartar o reabrir y debe explicar su decisión.
- Manual: solo el dueño publica/retira. La consulta devuelve extractos exactos con enlaces; no inventa reglas.
- Libreta: solo el dueño configurado en el sistema actual. Fechas de Madrid, formatos «mañana 10:00», «en 30 minutos» y «20/10/2026 18:00»; máximo un año. La tarea revisa cada 30 segundos. Si los privados están cerrados, intenta entregar en la libreta privada.
- Avisos de voz: peticiones personales de 1 a 168 horas, máximo diez pendientes. Se confirma por privado al crearlos. Se comprueba de nuevo la pertenencia al personal y la visibilidad del canal antes de avisar. Sin acceso al micrófono ni al audio.
- Acuerdos: fuente seleccionada por el dueño mediante menú contextual y coincidencias de conversaciones. Búsqueda literal normalizada por palabras, hasta 100 mensajes recientes por cada canal interno permitido (máximo ocho) y 500 registros guardados. No pretende ser una búsqueda exhaustiva ni considera una coincidencia como acuerdo. Respeta los permisos del solicitante; no consulta información importante, credenciales ni fichas privadas.

## Despliegue

`discord-interacciones` conserva la validación Ed25519 original y deriva las nuevas interacciones a `equipo.ts`. Devuelve confirmación diferida antes de ejecutar operaciones lentas. La tabla `bot_equipo` está protegida por RLS y no concede acceso a `anon` o `authenticated`.

`discord-equipo` se autentica con el secreto interno y atiende recordatorios y avisos de voz. Utiliza Discord Gateway con intents GUILDS y GUILD_VOICE_STATES, sin intents privilegiados. Solo abre la conexión si existen avisos pendientes. Mantiene una concesión para evitar conexiones paralelas, heartbeat, secuencia y sesión reanudable; rota antes del límite de duración de Edge Functions. La tarea de 30 segundos la reabre/reanuda, por lo que puede haber un pequeño retraso durante una rotación o recuperación.

El dueño es el mismo ID protegido que usa actualmente la aplicación (no necesariamente el propietario técnico del servidor de Discord). Discord permite siempre el acceso a los administradores y al propietario técnico del servidor, incluso en canales privados.

Archivos `equipo.ts` y `equipo-domain.ts` deben mantenerse idénticos entre ambas funciones. Comandos en `discord-equipo-comandos.json`; SQL en `security/discord-equipo.sql` y `security/discord-equipo-cron.sql`. Registrar los comandos por nombre con POST, conservando los anteriores.

Pruebas: `node --test test-equipo.mjs test-equipo-integration.mjs`.
