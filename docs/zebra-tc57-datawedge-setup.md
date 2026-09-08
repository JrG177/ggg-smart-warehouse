# Configuración Zebra TC57 para GGG Inventory

Esta configuración permite usar el gatillo físico del TC57 dentro de Chrome sin instalar otra aplicación.

## Perfil DataWedge

1. Abre **DataWedge** en el TC57.
2. Crea el perfil **GGG Warehouse** y actívalo.
3. En **Associated apps**, agrega Chrome (`com.android.chrome`) y selecciona todas sus actividades (`*`).
4. Activa **Barcode input** y selecciona el escáner interno.
5. Deja activos únicamente estos decoders: **Code 39, Code 128, QR Code y PDF417**. Desactivar formatos que no se utilizan mejora la velocidad y reduce falsos positivos.
6. Activa **Keystroke output**.
7. En **Basic data formatting**, activa **Send data** y **Send ENTER key**.
8. No agregues prefijos ni conviertas el contenido del código. La aplicación elimina `P`, `Q`, `K`, `V`, `3S` y `4S` cuando corresponde.

## Uso

1. Abre `ggginventory.online` en Chrome.
2. Entra a **Operación → Material → Registrar descarga**.
3. Selecciona **Zebra / lector físico**.
4. Selecciona el carrier y presiona **Agregar números de parte**.
5. Escanea con el gatillo. Cada lectura válida `P` suma un bulto y permanece en la lista.
6. Al terminar, corrige bultos o cantidad si una label representa más de un paquete y guarda la entrada.

## Prueba rápida

Si el TC57 emite el sonido pero la aplicación no recibe la lectura, revisa que **Keystroke output** esté activo y que **Send ENTER key** esté seleccionado. No debe existir ningún prefijo personalizado en DataWedge.
