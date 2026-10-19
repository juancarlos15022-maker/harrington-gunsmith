# Señor Harrington: módulos opcionales

## Estado de entrega

Los 40 módulos solicitados y los 3 de personalización están incluidos en el motor de capacidades. Ninguno se activa al desplegar. El registro `modules:config:<guild>` de la tabla privada `bot_equipo` guarda sus opciones y la activación inicial sigue apagada por módulo. La adopción del canal habilita los controles de administración (`activationLocked: false`), sin activar las funciones.

El canal `1561742079477026946` contiene el panel privado para JEFE. Permite catálogo, activación/desactivación por módulo, opciones y permisos mediante asistentes con selectores, simulaciones, configuración de canales y cargos, nombre/avatar/banner/bio del bot por servidor y estilos de roles con reintento de pendientes. El catálogo de funciones actuales permite detener comandos y grupos de tareas programadas; no invalida botones históricos ya publicados. Las claves internas de autenticación no se muestran ni se editan. Las simulaciones no escriben registros, no consultan servicios de pago y no envían operaciones a Discord. Los datos de ejemplo son ficticios, no archivos de audio o imágenes que deban subirse.

## Alcance y requisitos

Cada capacidad tiene un motor de operaciones y un adaptador con bloqueo de ejecución. La API interna del bot admite `modulos` con acciones `catalogue`, `preview`, `configure`, `execute` y `event`; conserva la autenticación interna que ya usaba el bot. `execute` resuelve la identidad del miembro contra Discord. Las opciones y permisos por acción deben configurarse antes del uso real. El panel ofrece botones de activar y desactivar; comprueba dependencias y evita desactivar un módulo del que dependen otros activos.

No equivale a haber puesto en marcha 40 servicios ni a disponer de todos los límites y acabados de los bots comerciales: son capacidades propias iniciales, desactivadas, con los alcances siguientes.

| Grupo | Operaciones incorporadas |
|---|---|
| 1–4 Atención | Canal privado, responsable, estados/historial y captura de conversaciones (últimos 100 mensajes por captura). |
| 5–10 Eventos | Recurrencia por días en zona horaria, plazas/espera, cupos por función, disponibilidad, recordatorios e hilos. |
| 11–14 Seguridad | Ventana de entradas, ventana de acciones por actor, avisos y medidas configurables, bloqueo/restauración de permisos, copias/restauración no destructiva de estructura con correspondencia de IDs. |
| 15–20 Comunidad | Salas de voz, recuentos de mensajes/voz, roles de intereses autorizados, RSS/Atom, sorteos y puntos decorativos separados de la caja. |
| 21–26 Gestión | Catálogo, simulación, permisos por acción, planes previos, preparación de lotes sin ejecución encadenada automática y decisiones de aprobación con historial. |
| 27–34 Organización | Tareas con vencimiento, partes de relevo, recibos de lectura, versiones, cursos por etapas, asuntos con notas, formularios y encuestas. |
| 35–40 Participación | Palabras suscritas con comprobación de acceso, novedades de canales configurados (últimos 100 por canal, máximo 10), preferencias/horario silencioso, caducidad de mensajes propios, traducción a petición y concursos por categoría. |
| 41–43 Personalización | Nombre/color sólido de rol, estilos oficiales mejorados cuando estén desbloqueados, Soundboard y emojis PNG/JPEG/GIF. |

Las capacidades de escucha inmediata necesitan el adaptador Gateway en alojamiento permanente. `module-gateway.mjs` está incluido, no instalado ni ejecutado. Exige Node >=22 y variables de entorno `HG_DISCORD_TOKEN`, `HG_BOT_SECRET`, `HG_SUPABASE_URL`. No guardar esas credenciales en archivos o Git. Deben habilitarse los intents necesarios y revisar permisos antes del uso. Al activar voz/estadísticas, reiniciar el adaptador para recibir la lista inicial de estados de voz. No recoge actividad mientras el bloqueo global está activo.

El cron existente solo consulta el bloqueo; con el bloqueo activo no ejecuta los módulos ni crea sus trabajos. RSS requiere una URL HTTPS pública configurada. Traducción utiliza la IA existente únicamente cuando se solicita y el módulo está habilitado. Preferencias en modo resumen se guardan como preferencia: las entregas resumidas adicionales requieren configurar su programación; no hay envío automático por defecto.

Las copias son de estructura. No prometen recuperar mensajes eliminados ni conservar los IDs de canales recreados. No se toca la estructura actual al instalar. Los lotes son planes revisables; aplicar sus acciones requiere comprobar individualmente permisos y activación. Las aprobaciones registran la decisión y no ejecutan automáticamente propuestas arbitrarias.

## Estado de Discord comprobado al entregar

Servidor `1520875506214371439`: Soundboard disponible, nivel 0, 0 boosts, sin `ENHANCED_ROLE_COLORS`. El rol del bot ocupa la posición 11 y JEFE la 12: Discord impide modificar JEFE desde el bot. El código no compra ni asigna boosts, no mueve roles y no cambia nombres o colores existentes. Colores mejorados y disponibilidad de expresiones dependen de las prestaciones de Discord.

## Pruebas

`node --experimental-strip-types test-modules.mjs` cubre 43 motores con datos ficticios; 43 rechazos de ejecución desactivada; cron/eventos sin red ni escrituras; permisos del panel; jerarquía y boosts; Soundboard; espera; puntos; acceso por canal; y RSS. Se comprueba además el bloqueo y el catálogo en la función desplegada. El adaptador Gateway no se inicia como prueba.

## Activación posterior

Requiere una instrucción expresa del propietario: quitar el bloqueo global, configurar los módulos escogidos y sus dependencias, probarlos en un canal reservado y habilitarlos individualmente. No usar una activación masiva. Las funciones no tienen acceso a secretos del bot por las respuestas del panel.

## Detección del panel y apariencia

La crónica busca cada cinco minutos canales de texto cuyo nombre, normalizado sin acentos ni adornos, sea Configuración Bot, en los servidores del bot. Publica o actualiza un único mensaje persistente tras restringirlo a JEFE, bot y administradores. En otros servidores usa registros aislados y no expone datos del negocio de Harrington. El perfil se modifica con PATCH /guilds/{guild}/members/@me, por servidor, sin modificar la identidad global del bot. Las imágenes se aceptan desde adjuntos HTTPS del CDN de Discord, con límite de 8 MB y sin redirecciones.

El perfil visual Harrington conserva los IDs y permisos de los roles. Guarda nombre/color deseados y estado de aplicación, incluidos roles por encima del bot. Los pendientes se reintentan cada cinco minutos. Los colores de nombres de usuario siguen las reglas nativas de prioridad de roles; no se sustituyen los nombres personales. Los degradados se solicitan solo si Discord ofrece ENHANCED_ROLE_COLORS.

Pruebas: node --experimental-strip-types test-modules.mjs y test-control.mjs.

## Configuración guiada e instrucciones

`/instrucciones` devuelve una guía privada de cinco pasos y enlaza el canal de administración. La detección del canal registra el comando por servidor sin sobrescribir los demás comandos. El panel contiene fichas para las 43 funciones con todas sus acciones manuales, requisitos y límites. Las opciones ya no requieren JSON: se eligen canales, roles, miembros, valores, horarios de Madrid, listas y tablas por líneas en formularios guiados. Los formularios admiten preguntas de texto, número y opciones.

Los asistentes guardan borradores privados, ligados a servidor y usuario y con caducidad de 30 minutos. Permiten volver atrás, conservar valores y cancelar. Solo la confirmación guarda la configuración o ejecuta una acción real; no activa automáticamente módulos. Los pasos antiguos se rechazan y la confirmación usa una reserva para evitar duplicados simultáneos. El lote permite acumular hasta diez acciones y preparar su plan, sin ejecutarlas.

Los registros tienen consulta paginada y etiquetas legibles. Las fichas históricas se obtienen de los comandos reales de Discord e incluyen sus opciones; permiten activar/desactivar comandos, subcomandos, grupos de cron y botones por flujo. La ayuda y administración no quedan bloqueadas por estos interruptores. La configuración de permisos, canales y cargos se conserva. Los permisos y la jerarquía propios de Discord, los boosts y la instalación de una conexión Gateway permanente siguen siendo requisitos externos: el panel los explica sin afirmar que los active por sí mismo.

Validación adicional: `node --experimental-strip-types test-guide.mjs` (43 fichas, formatos y horario de Madrid, privacidad, cancelación, confirmaciones, datos sin cambios previos, tarea real en adaptador simulado, lotes sin ejecución, subcomandos y botones).
