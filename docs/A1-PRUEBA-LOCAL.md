# A1: prueba local sobre 04114a3

Este parche agrega `/a1` y el acceso **A1 · Prueba** al menú existente. Conserva los otros módulos. Es un prototipo funcional con datos en localStorage, no una integración de producción con Supabase. No requiere SQL ni escribe registros reales de A1.

## Aplicar en Windows CMD

Desde `C:\Users\kike1\Projects\ggg-smart-warehouse`, con el parche descargado en Downloads:

```cmd
git apply --check "%USERPROFILE%\Downloads\a1-prueba-local-04114a3.patch"
git apply "%USERPROFILE%\Downloads\a1-prueba-local-04114a3.patch"
npm run build
node scripts/test-a1-trial.mjs
npm run dev -- --host 0.0.0.0
```

No hagas commit ni push para esta prueba. Abre la dirección que indica Vite y agrega `/a1`, por ejemplo `http://localhost:5173/a1`. En el TC usa `http://IP-DE-TU-PC:5173/a1`, conectado al mismo Wi-Fi. Usa `ipconfig` para consultar IPv4 y permite Node en la red privada de Windows si el firewall lo solicita. Si Vite usa otro puerto, usa ese puerto en ambos equipos.

La app conserva sus variables de entorno habituales de Supabase para arrancar. A1 no llama a Supabase, pero los otros módulos conservan sus conexiones normales.

## Prueba de extremo a extremo

1. En **Recepciones**, conserva la fecha de hoy o edítala. Escribe `1ZTEST000000000135` y pulsa **Agregar tracking**, o escanea un tracking real para verificar qué entrega el TC. El campo debe tener el foco; configura DataWedge para enviar Enter al final de la lectura. No hace falta MultiBarcode: se lee un identificador por vez.
2. En la caja, pulsa **Asignar sticker**. Escribe/escanea `000135` o `A1-000135`, pon la ubicación y pulsa **Guardar caja**. Ambos stickers se muestran como caja **135**. Si todavía no hay estampitas, escribe el número que tiene la caja a mano.
3. Registra otro tracking: `1ZTEST000000000136`, sticker `000136`. Intenta repetir un tracking o asignar el sticker 135 a otra caja: debe bloquear el duplicado.
4. En **Inventario**, busca 135 o su tracking. Marca **NOMS** o **OS&D** y guarda. OS&D permite Sobrante/Faltante/Daño y requiere una observación; foto opcional menor de 750 KB. NOMS y OS&D pueden coexistir.
5. En **Facturas**, escribe `PRUEBA-A1-001`. El prefijo INV- se agrega una sola vez. Elige **58** o **OTHER**; OTHER exige escribir la unidad. Pulsa **Crear factura**.
6. Pulsa **Agregar Trackings**, escanea `000135` o `1ZTEST000000000135`. Solo se asigna una caja. Repite el otro identificador: no debe duplicarla. Una caja desconocida pide registrarla primero.
7. Crea otra factura e intenta asignar la caja 135: debe mostrar la factura donde ya está asignada. Puedes quitarla de la primera mientras siga abierta; vuelve a estar disponible.
8. Vuelve a la factura correcta, pulsa **Revisar salida** y después **Confirmar salida** cuando corresponda. Las cajas quedan en historial como **Salió**; no se reutilizan sus números ni se pueden asignar a otra factura.
9. Recarga la página: los datos persisten en ese navegador. En Inventario selecciona **Salieron** para ver las cajas despachadas.
10. **Exportar prueba** descarga un JSON con cajas, facturas e historial. Es una copia de revisión; esta versión no incluye restauración/importación del JSON.

## Límites de esta prueba

- Computadora y TC tienen datos separados. También son separados entre distintos navegadores, perfiles, direcciones o puertos. Al conectarse a Supabase en una segunda etapa podrán compartir inventario.
- No es almacenamiento de producción: borrar los datos del navegador elimina la prueba. Las fotos consumen el espacio del navegador; si se llena, el guardado muestra error y no informa éxito.
- Se identifica una caja por tracking único y sticker opcional, con numeración que aumenta y no se reutiliza. No hay límite de 1000 en el sistema.
- El módulo controla cajas y salida por factura. No importa partidas ni valida contenido, números de parte o cantidades.
- Las recepciones anteriores no se migran a esta prueba. El acceso A1 tiene datos separados, pero no permisos separados por usuario todavía.
- La fecha de recepción usa la fecha local del dispositivo. El historial conserva fecha y hora de los cambios.

## Quitar el parche si decides volver

Detén Vite con Ctrl+C. Si no has editado los archivos del parche después de aplicarlo:

```cmd
git apply --reverse --check "%USERPROFILE%\Downloads\a1-prueba-local-04114a3.patch"
git apply --reverse "%USERPROFILE%\Downloads\a1-prueba-local-04114a3.patch"
```

Quitar el parche no borra sus datos de prueba del navegador. No vuelvas a aplicar el mismo parche si ya está aplicado.
