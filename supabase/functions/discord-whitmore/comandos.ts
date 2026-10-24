// Órdenes con / del Señor Whitmore (gobierno). Se registran en el servidor de la armería, solo para el Consejo.
const S = 3, I = 4, U = 6, N = 10, SUB = 1;
const o = (name: string, description: string, type = S, required = false, extra: Record<string, unknown> = {}) => ({ type, name, description, required, ...extra });
const sub = (name: string, description: string, options: unknown[] = []) => ({ type: SUB, name, description, options });
const FECHA = o("fecha", "Día: 25/10, 25/10/2026, hoy o mañana", S, true, { max_length: 20 });
const HORA = o("hora", "Hora: 18:30", S, true, { max_length: 5 });
export const COMANDOS = [
  { name: "whitmore", description: "Lo que puede hacer el Sr. Whitmore por el gobierno", options: [] },
  { name: "acceso", description: "Vincular el navegador con su cuenta del Gobierno", options: [o("codigo","Código que muestra su navegador al abrir la web",S,false,{max_length:20})] },
  { name: "cita", description: "Agenda del gobernador", options: [
    sub("nueva", "Apuntar una cita en la agenda del gobernador", [FECHA, HORA, o("con", "Con quién", S, true, { max_length: 100 }), o("lugar", "Dónde", S, false, { max_length: 100 }), o("motivo", "Para qué", S, false, { max_length: 300 })]),
    sub("hoy", "Agenda de hoy"),
    sub("semana", "Agenda de los próximos 7 días"),
    sub("cancelar", "Cancelar una cita", [o("numero", "Número de la cita", I, true, { min_value: 1 })]) ] },
  { name: "audiencia", description: "Solicitudes para reunirse con el gobernador", options: [
    sub("nueva", "Apuntar una solicitud de audiencia (el gobernador la acepta o la rechaza)", [o("quien", "Quién la pide", S, true, { max_length: 100 }), o("motivo", "Para qué", S, true, { max_length: 400 }), o("telegrama", "Su telegrama", S, false, { max_length: 20 }), o("cuando", "Cuándo le vendría bien (opcional)", S, false, { max_length: 60 })]),
    sub("pendientes", "Audiencias sin contestar") ] },
  { name: "reunion", description: "Reuniones del equipo de gobierno", options: [
    sub("nueva", "Convocar una reunión", [o("titulo", "Asunto", S, true, { max_length: 100 }), FECHA, HORA, o("orden", "Orden del día (separa los puntos con ;)", S, false, { max_length: 900 }), o("lugar", "Dónde", S, false, { max_length: 100 })]),
    sub("proximas", "Próximas reuniones") ] },
  { name: "acto", description: "Calendario de campaña", options: [
    sub("nuevo", "Apuntar un acto, mitin o visita de campaña", [o("titulo", "Qué es", S, true, { max_length: 100 }), FECHA, HORA, o("lugar", "Dónde", S, true, { max_length: 100 }), o("notas", "Notas", S, false, { max_length: 500 })]),
    sub("proximos", "Próximos actos") ] },
  { name: "telegrama", description: "Telegramas IC del gobierno", options: [
    sub("recibido", "Registrar un telegrama que ha llegado", [o("de", "De quién", S, true, { max_length: 100 }), o("texto", "Lo que dice", S, true, { max_length: 1500 }), o("telegrama", "Su número de telegrama", S, false, { max_length: 20 })]),
    sub("redactar", "Redactar un telegrama del gobernador, listo para copiar", [o("para", "Para quién", S, true, { max_length: 100 }), o("texto", "Lo que quieres decir", S, true, { max_length: 1500 }), o("telegrama", "Su número de telegrama", S, false, { max_length: 20 })]),
    sub("lista", "Últimos telegramas") ] },
  { name: "decreto", description: "Decretos, comunicados y cartas con la firma del gobernador", options: [
    sub("nuevo", "Redactar un documento para que lo firme el gobernador", [o("tipo", "Tipo de documento", S, true, { choices: [{ name: "Decreto", value: "decreto" }, { name: "Comunicado", value: "comunicado" }, { name: "Carta", value: "carta" }] })]),
    sub("lista", "Documentos firmados y borradores") ] },
  { name: "propuesta", description: "Propuestas del equipo con votación", options: [
    sub("nueva", "Presentar una propuesta para votarla"),
    sub("abiertas", "Propuestas que se están votando") ] },
  { name: "programa", description: "Programa de gobierno (propuestas aprobadas)", options: [o("publicar", "Publicarlo en el canal de campaña", 5, false)] },
  { name: "tarea", description: "Encargos del equipo con plazo", options: [
    sub("nueva", "Encargar una tarea", [o("para", "Quién la hace", U, true), o("texto", "Qué hay que hacer", S, true, { max_length: 500 }), o("plazo", "Para cuándo: 25/10, hoy o mañana", S, false, { max_length: 20 })]),
    sub("lista", "Tareas pendientes", [o("de", "Solo las de esta persona", U, false)]) ] },
  { name: "contacto", description: "Agenda de contactos IC", options: [
    sub("nuevo", "Apuntar un contacto", [o("nombre", "Nombre", S, true, { max_length: 100 }), o("telegrama", "Telegrama", S, false, { max_length: 20 }), o("tipo", "Qué es (comerciante, sheriff, prensa…)", S, false, { max_length: 60 }), o("notas", "Notas", S, false, { max_length: 500 })]),
    sub("buscar", "Buscar un contacto", [o("texto", "Nombre, tipo o nota", S, true, { max_length: 60 })]),
    sub("lista", "Todos los contactos") ] },
  { name: "negocio", description: "Registro de negocios del condado", options: [
    sub("nuevo", "Apuntar un negocio", [o("nombre", "Nombre del negocio", S, true, { max_length: 100 }), o("dueno", "Dueño", S, false, { max_length: 100 }), o("tipo", "Tipo (armería, saloon, granja…)", S, false, { max_length: 60 }), o("ubicacion", "Ubicación", S, false, { max_length: 60 }), o("telegrama", "Telegrama", S, false, { max_length: 20 }), o("notas", "Notas (relación, apoyos…)", S, false, { max_length: 500 })]),
    sub("buscar", "Buscar un negocio", [o("texto", "Nombre, dueño, tipo o nota", S, true, { max_length: 60 })]),
    sub("lista", "Todos los negocios") ] },
  { name: "cuenta", description: "Cuentas de la campaña y del gobierno", options: [
    sub("ingreso", "Apuntar un ingreso", [o("importe", "Importe en dólares", N, true, { min_value: 0.01 }), o("concepto", "Concepto", S, true, { max_length: 200 })]),
    sub("gasto", "Apuntar un gasto", [o("importe", "Importe en dólares", N, true, { min_value: 0.01 }), o("concepto", "Concepto", S, true, { max_length: 200 })]),
    sub("saldo", "Saldo y últimos movimientos") ] },
  { name: "elecciones", description: "Cuenta atrás a las elecciones", options: [
    sub("fijar", "Fijar el día y la hora de las elecciones", [FECHA, HORA]),
    sub("ver", "Cuánto falta") ] },
  { name: "resumen", description: "Resumen del día: agenda, tareas y propuestas", options: [] },
  { name: "firma", description: "Nombre y cargo con los que firma el gobernador", options: [o("cargo", "Cargo (p. ej. Candidato a Gobernador)", S, true, { max_length: 60 }), o("nombre", "Nombre con el que firma", S, false, { max_length: 60 })] },
].map((c) => ({ ...c, type: 1, contexts: [0] }));
