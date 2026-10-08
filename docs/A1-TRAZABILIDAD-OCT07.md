# Embarques y A1: prueba del 7 de octubre

Base: código disponible tras los parches de optimización enviados para bf9cd10. Si `git apply --check` falla, no uses `--reject` ni fuerces el parche: comparte `git log -1 --oneline` y `git status -sb` para adaptar la base.

## Qué incluye

1. Embarques: pulsa el nombre de la factura. El modal lee las partidas importadas y las lecturas aceptadas en Supabase, mostrando cantidad, escaneadas, pendientes y estado. En facturas de recepción muestra revisión de partes sin inventar un conteo escaneado.
2. A1: recepción continua, clasificación individual obligatoria antes de finalizar, búsqueda por tracking completo o últimos cuatro dígitos, fecha de recepción, historial por fecha y PDF diario.
3. Salida: escanear todos los trackings de las cajas que salen, revisar la lista y confirmar. Conserva fecha original, fecha de salida y eventos. Una factura A1 queda salida cuando todas sus cajas asignadas han salido.
4. Normal y NOM sin factura quedan en Falta de factura. OSND queda retenida, no permite quitar la marca, facturar ni salir. No hay un botón para autorizar liberación. El registro de una autorización externa no se implementa como una decisión del operador.
5. Conexión A1 compartida opcional: guarda en una tabla nueva aislada; el servidor comprueba revisión y rechaza sobrescrituras y liberaciones desde el operador. Actualiza cada 10 segundos o al volver a la ventana.

El logo y el selector claro/oscuro no se modifican. Este paquete implementa estas funciones, no un rediseño completo de todos los módulos.

## Probar localmente primero

Descarga los tres parches en Downloads. Antes revisa el estado:

```bat
git log -1 --oneline
git status -sb
```

Si hay cambios sin guardar, haz respaldo o commit antes de continuar. Crea una rama de prueba:

```bat
git switch -c prueba/a1-trazabilidad-oct07
git apply --check "%USERPROFILE%\Downloads\embarques-detalle-factura-oct07.patch"
git apply "%USERPROFILE%\Downloads\embarques-detalle-factura-oct07.patch"
git apply --check "%USERPROFILE%\Downloads\a1-clasificacion-salida-local-oct07.patch"
git apply "%USERPROFILE%\Downloads\a1-clasificacion-salida-local-oct07.patch"
git apply --check "%USERPROFILE%\Downloads\a1-conexion-compartida-oct07.patch"
git apply "%USERPROFILE%\Downloads\a1-conexion-compartida-oct07.patch"
npm run build
node scripts/test-a1-trial.mjs
node scripts/test-a1-workflow.mjs
node scripts/test-a1-persistence.mjs
npm run dev -- --host 0.0.0.0
```

Por defecto A1 sigue local. No actives VITE_A1_SHARED aún. Si existe esa variable de un ensayo previo, usa `VITE_A1_SHARED=false` en `.env.local` y reinicia Vite. No se requiere ejecutar SQL para probar A1 localmente. El detalle de Embarques sigue consultando el Supabase configurado, sin escribir ni completar facturas desde ese modal.

Abre la URL **http://** Network de Vite desde el TC57. No uses HTTPS para ese servidor local.

## Prueba operativa

- En Embarques abre una factura importada: comprueba sus partes, cantidades y conteos; cierra con Cerrar o Escape.
- En A1 usa Solo trackings; cada lectura debe terminar en Enter. Usa tracking + sticker solo si quieres vincular ambos.
- Recibe una caja Normal, una NOM y una OSND. Clasifica cada una; OSND requiere observación. Finalizar recepción queda deshabilitado mientras falte clasificación.
- Normal/NOM aparecen como Falta de factura; OSND como Retenida. Buscar por los últimos cuatro muestra todas las coincidencias, no elige una caja automáticamente.
- Descarga PDF desde Inventario para la fecha elegida; revisa su contenido antes de enviarlo a Edgar. No se envía automáticamente.
- En Salida lee cada tracking. OSND, pendientes de recepción, duplicados y cajas ya salidas se rechazan. Quitar retira de la lista de preparación, no del inventario.
- Confirmar registra únicamente las cajas escaneadas. Revisa que la recepción original siga visible y que el evento de salida se conserve.
- Para cajas antiguas de la prueba local sin clasificación, selecciona su fecha de recepción y clasifícalas/finaliza antes de facturar o salir.
- UPS conserva extracción del 1Z dentro de lecturas concatenadas. FedEx y XPO admiten un tracking completo aislado; este paquete no promete separar cualquier combinación de códigos de esos carriers. Si llega información extra, conserva esa lectura real para ajustar el parser.

## Activar inventario compartido después de probar

Primero prueba la migración en un proyecto Supabase de prueba, con el código apuntando a ese proyecto. El SQL no se ha ejecutado contra tu Supabase desde esta sesión.

1. Ejecuta completo `supabase/migrations/20261007_a1_shared_workspace.sql` en SQL Editor. Crea `a1_workspace` y la función `save_a1_workspace`. Sigue el modelo de acceso anon/authenticated del sistema existente. No cambia tablas ni funciones de facturación normal.
2. Agrega `VITE_A1_SHARED=true` al entorno de prueba y reinicia Vite. El encabezado debe decir A1 COMPARTIDO. Si falta el SQL o falla conexión, bloquea escrituras y muestra error; no guarda silenciosamente en local.
3. Abre dos navegadores/equipos. Recibe una caja en uno y verifica que aparece en el otro. Prueba guardados simultáneos: si hay conflicto, recarga y pide reintentar en lugar de sobrescribir.
4. Comprueba OSND retenida y salida rechazada también en modo compartido. Revisa PDF y el historial desde ambos equipos.

El inventario compartido empieza vacío. No importa ni borra automáticamente los registros locales de cada navegador; exporta esos respaldos antes de cambiar de modo. No mezcles un inventario local con el compartido sin revisar duplicados. Las liberaciones externas requieren un procedimiento de registro autorizado separado; no se proporciona una herramienta para que el operador libere OSND.

Después de validar, agrega `VITE_A1_SHARED=true` en el entorno de Vercel correspondiente y despliega una nueva compilación. No subas archivos `.env` a Git. Si mantienes la variable desactivada, A1 sigue siendo una prueba por navegador, aunque hayas hecho push.

## Validación realizada

- Compilación TypeScript y Vite correcta.
- Pruebas de tracking UPS real, duplicados, stickers y datos conservados.
- Pruebas de clasificación, OSND bloqueada, salida por escaneo, fechas y rechazo de salidas parciales.
- Prueba de persistencia con servidor simulado: conflicto y reintento sin pérdida.
- Parches revisados con `git apply --check` en la copia base.
- Pendiente: prueba real de SQL, conexiones entre equipos, lecturas físicas FedEx/XPO y presentación del PDF en tu entorno.
