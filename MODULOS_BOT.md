# Señor Harrington: módulos opcionales

## Estado de entrega

Los 40 módulos solicitados y los 3 de personalización están incluidos en el motor de capacidades. Ninguno se activa al desplegar. El registro `modules:config:<guild>` de la tabla privada `bot_equipo` guarda sus opciones y `activationLocked: true` bloquea activaciones, incluso por una llamada de configuración. No se alteran las funciones históricas.

El canal `1561742079477026946` contiene el panel privado para JEFE. Permite catálogo y simulaciones en memoria. Las simulaciones no escriben registros, no consultan servicios de pago y no envían operaciones a Discord. Los datos de ejemplo son ficticios, no archivos de audio o imágenes que deban subirse.

## Alcance y requisitos

Cada capacidad tiene un motor de operaciones y un adaptador con bloqueo de ejecución. La API interna del bot admite `modulos` con acciones `catalogue`, `preview`, `configure`, `execute` y `event`; conserva la autenticación interna que ya usaba el bot. `execute` resuelve la identidad del miembro contra Discord. Las opciones y permisos por acción deben configurarse antes del uso real. El panel no ofrece un botón de activar.

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
