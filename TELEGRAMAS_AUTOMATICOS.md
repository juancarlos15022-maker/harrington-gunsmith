# Fichas automáticas de contactos
Canal telegramas; solo mensajes de Altavilla (autor configurado). Se revisa cada 30 segundos mediante discord-puerta. Reconoce nombre + Telegrama: CÓDIGO o Nombre SD1234. Los datos adicionales se conservan en Observaciones; no se inventa Quién es. Plantilla idéntica a Agenda de la casa. Mensajes ambiguos o con adjuntos se conservan.

Publica antes de borrar, verifica la ficha y relee el original por si fue editado. Copia del texto original y ID de publicación en bot_telegramas_mensajes, privada para service_role. Nonce por mensaje, reconciliación y exclusión concurrente. No modifica fichas de clientes/proveedores ni contabilidad.

Restauración: desplegar index.ts anterior de backups/telegramas-20261015 con su comun.ts; al retirar la llamada se detiene la automatización. Las fichas y originales respaldados se conservan.
