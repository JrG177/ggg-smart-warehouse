# Optimización de operación y siguientes QR

Este cambio es incremental: requiere los parches de búsqueda en embarques, ignorar bultos CSV y revalidar el botón de completar factura.

## Cambios
- Carga de páginas bajo demanda. A1 ya no necesita descargar facturación/PDF al entrar.
- Pantalla de carga accesible entre módulos.
- Documentos y exportaciones agrupados en un desplegable por factura.
- Identificador de factura con salto de línea y acciones con ancho limitado.
- Bultos pendientes indicados expresamente; se omite el contador de recepciones cuando es cero.
- La demostración de factura permanece disponible solamente en desarrollo.
- Se incluye la migración de cierre de facturas importadas ya aplicada en Supabase. Guardar este archivo en Git no ejecuta la migración por sí solo.

## Prueba antes de publicar
1. npm run build
2. node scripts/test-a1-trial.mjs
3. node scripts/test-invoice-ux-trial.mjs
4. npm run dev -- --host 0.0.0.0
5. Abrir A1, Facturas y Embarques; verificar navegación y abrir Documentos y exportaciones.
6. En una factura de prueba verificar carga, capturar bultos y completar; localizarla en Embarques. Estos módulos usan la base configurada, también en local.

## QR de MTY / etiquetas manuscritas: siguiente entrega
La optimización no implementa todavía QR con múltiples partes. La impresión y lectura de QR de paquetes existente se conserva.

El próximo flujo será capturar o importar una packing list, revisar visualmente números de parte/cantidades, asociar cada paquete físico a un identificador único y generar su QR. Un paquete con varias partes necesitará varias líneas ligadas al mismo identificador. El lector validará todas las líneas antes de guardarlas, con un guardado único y rechazo de duplicados. No debe marcarse una tarima completa por leer un QR si no corresponde al contenido físico revisado.

Mantener separados tracking, sticker de A1, identificador de paquete, número de parte y cantidad. No cambiar el formato de QR existente sin compatibilidad con etiquetas ya impresas. Preparar soporte versionado y transaccional de múltiples líneas en una migración y parche posteriores, usando una packing list real como prueba.

## Publicación
Guardar los cambios específicos, construir y confirmar el commit en prueba/optimizaciones. Integrar mediante git merge --ff-only prueba/optimizaciones desde feature/pallet-details, y subir esa rama. Si el merge no puede avanzar, detenerse y revisar el estado en vez de forzarlo. El despliegue depende de la rama conectada a Vercel.
