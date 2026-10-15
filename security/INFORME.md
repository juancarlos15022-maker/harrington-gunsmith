# Refuerzo de seguridad · 15 de octubre de 2026

Objetivo: Vincent Harrington es el único administrador. El resto del personal conserva ventas, fabricación, sus fichajes y gestión operativa permitida. Saber programar no permite saltarse las reglas de la base de datos; no se ofrece garantía de seguridad absoluta.

## Copias y recuperación

- Rama `backup/antes-blindaje-2026-10-15` anterior al cambio.
- Copias de las 37 tablas y configuración de funciones, políticas y permisos en `hg_security.snapshots`, con prefijo `antes-blindaje-20261015:`. Incluyen datos sensibles, por lo que no se publican ni se exponen mediante la API.
- Las funciones originales se conservan en `security-before.json`. Los datos de ventas e inventario se han probado exclusivamente en una base aislada.

## Cambios

- Identidad de administrador vinculada al UID real y al empleado de Vincent, no al nombre, rango o una variable del navegador.
- Se exige que cuenta, empleado, metadatos privados y sesión vigente coincidan. Una baja o revocación de sesión corta la autorización aunque el JWT aún no haya caducado.
- Eliminada la autorización por base abierta o ausencia de claims en peticiones de la API. El cron administrativo y el bot conservan sus accesos de servicio.
- Lectura pública de tarjetas reducida a nombre, identificador y puesto. Contraseñas, contactos, sueldos e inventario no se sirven al visitante.
- Solo el propietario puede administrar personal, recetas, proveedores, precios, descuentos, configuración, inventarios físicos y restauraciones.
- Se bloquean los cambios directos de stock del personal. Las funciones de venta/fabricación crean un contexto de operación en la transacción; el cliente no dispone de un RPC para establecer ese contexto.
- Fabricación del empleado: identidad comprobada y consumo contrastado con recetas. No se admiten incrementos de stock sin materiales mediante ese RPC.
- Historial operativo protegido contra modificaciones y borrados del personal; la administración y las operaciones sensibles dejan una auditoría en esquema privado.
- Revocados permisos anónimos sobre tablas y funciones internas, así como permisos automáticos peligrosos en futuros objetos.
- Contraseñas personales con PBKDF2 SHA-256, 310.000 iteraciones y sal aleatoria. La contraseña compartida ya no permite entrar como un jefe. El propietario debe configurar la suya desde la sesión de Vincent que ya tenía abierta.
- Rubí dispone de contraseña independiente según la instrucción del propietario; no se publica su contraseña ni su hash en el repositorio.
- Alta inicial: al aceptar el propietario una solicitud en Discord, la carta privada existente incluye un enlace de activación individual, de un solo uso y con caducidad de 24 horas. No se puede reclamar una tarjeta usando únicamente el ID público.
- Reseteo: únicamente el propietario lo solicita; invalida las sesiones anteriores y entrega un nuevo enlace de activación. Se desactiva la recuperación mediante palabra compartida.
- Límite de intentos de inicio de sesión persistente por cuenta e IP.
- Webhooks ocultos al personal; los envíos pasan por un intermediario autenticado con destinos limitados a los canales configurados, sin menciones masivas, con control de tamaño y frecuencia. Borrar mensajes requiere al propietario.
- Discord: las decisiones de Dirección dependen del ID firmado del propietario; no basta con tener un rol. Se rechazan firmas con más de cinco minutos de antigüedad.
- IA: diagnóstico restringido al propietario, sesiones revocadas rechazadas y administración vinculada al propietario.
- CSP con scripts propios y hash para el único script inicial; bloqueo de objetos, formularios externos y conexiones ajenas a Supabase. Los manejadores HTML de imagen se sustituyen por eventos desde código propio. Fichar entrada/salida conserva sus controles.
- Caché de la PWA renovada y destinos de notificaciones limitados a la propia aplicación.

## Validación

- Base PostgreSQL aislada: rechazo anónimo; rechazo de otro jefe y empleado para administración, inventarios y cambios directos; fabricación con receta válida; rechazo de consumo incorrecto; protección de historial/clientes; control del propietario; reseteo y revocación de sesiones.
- Cuentas con servicios simulados: rechazo de contraseña compartida del propietario, recuperación antigua, alta sin activación, reseteo de terceros y sesión inválida; contraseña personal derivada y no guardada en claro.
- Interfaz aislada: tarjetas públicas, CSP, restricción de Dirección, formulario personal, envío y ausencia de contraseña en almacenamiento; controles de fichaje conservados.
- No se prueban compras, ventas ni fabricación con existencias de producción. No se envían mensajes ficticios a Discord ni se aceptan solicitudes reales para las pruebas.

## Límites y tareas del titular

- Debe crear su contraseña personal desde su sesión actual de Vincent. La entrada con la contraseña compartida queda desactivada; no cerrar esa sesión hasta completar el cambio. Si se pierde, la recuperación requiere acceso administrativo a Supabase; ninguna otra tarjeta puede recuperarla.
- Debe activar doble factor en GitHub, Supabase y Discord. No se modifica esa configuración de cuentas externas desde este despliegue.
- Los webhooks que pudieron descargarse antes del cambio siguen siendo credenciales válidas hasta que se roten. Ocultarlos ahora no revoca copias previas. Su rotación requiere coordinar referencias a mensajes existentes para no duplicar fichas.
- GitHub Pages no permite configurar todas las cabeceras HTTP de seguridad. La protección contra incrustación mediante `frame-ancestors` necesita un alojamiento o proxy con cabeceras configurables.
- Los trabajadores conservan tareas autorizadas: registrar una venta o fabricar con materiales tiene efectos legítimos. Esta separación no sustituye una auditoría posterior de toda la validación comercial de descuentos, precios especiales, anticipos y encargos.
- Las copias actuales están en el mismo proyecto. Conviene mantener además una copia externa cifrada, separada de las credenciales de Supabase.
