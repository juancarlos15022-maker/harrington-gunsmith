# Diplomas de ascenso

Genera un PNG personalizado usando el fondo diploma.webp y el sello de la web. La fuente DejaVu Serif está incluida con su licencia y los recursos visuales se empaquetan para no depender de una web abierta.

El destinatario se obtiene exclusivamente del Discord vinculado al empleado en la plantilla. Atiende los ascensos desde el de Elías Riquelme del 20/10/2026 (1792500821371), incluido como recuperación autorizada; no envía diplomas históricos anteriores.

Autenticación interna mediante bot_cfg.secreto. El bot cron revisa pendientes cada minuto; los ascensos de la web y de Discord solicitan el envío inmediato. Estado por empleado y fecha en datos (diploma:ID:TS), reserva concurrente y nonce de Discord. Si se pierde la confirmación, busca el adjunto o la imagen del embed en el privado antes de reintentar. Los privados cerrados quedan pendientes durante una hora. No altera puestos ni sueldos.

Pruebas: node harrington-diplomas/test.mjs. Se comprobó también generación real PNG en Edge y entrega a Elías con imagen 1000 × 663.
