# LAS YULAS · Menú digital para GitHub Pages

Esta versión conserva el editor existente, la integración con Cloudinary y la tipografía Outfit. Añade una capa opcional de sincronización compartida con Supabase y mejoras táctiles para el editor en móviles. GitHub Pages continúa alojando la parte web estática.

## Estructura

```text
/
├── index.html
├── .nojekyll
├── README-GITHUB-PAGES.md
├── css/styles.css
├── js/
│   ├── app.js
│   ├── data.js
│   ├── cloud.js
│   └── cloud-config.js
├── sql/supabase-setup.sql
└── assets/                 # copiar desde el proyecto original
    ├── logo.png
    ├── banner.jpg
    └── favicon.ico
```

## 1. Publicación básica en GitHub Pages

1. Copia el contenido de esta carpeta a la raíz del repositorio, sin anidar la carpeta `lasyulas-github-pages`.
2. En GitHub abre **Settings → Pages → Deploy from a branch**, selecciona la rama principal y `/(root)`.
3. Conserva los nombres de archivo y las mayúsculas/minúsculas.
4. La carpeta `assets/` no venía en los archivos entregados. Copia la carpeta original para que se carguen el logo, banner y favicon.

La sincronización compartida queda desactivada hasta completar el paso 2 de abajo; mientras tanto, el sitio conserva la persistencia local anterior.

## 2. Activar menú compartido y varios administradores

### Crear proyecto y credenciales

1. Crea un proyecto en Supabase.
2. Abre **Project Settings → API** y copia la Project URL y la clave publicable (`anon`/publishable).
3. Edita `js/cloud-config.js` y reemplaza `https://TU-PROYECTO.supabase.co` y `TU-CLAVE-PUBLICABLE-ANON` por los valores reales.
4. Nunca coloques una clave `service_role` o secreta en archivos del frontend ni en GitHub.

### Crear tablas y permisos

1. En Supabase abre **SQL Editor**.
2. Ejecuta el archivo `sql/supabase-setup.sql` completo.
3. Las políticas permiten lectura pública del menú, pero solo los usuarios autenticados incluidos en `menu_admins` pueden escribir la configuración. Los visitantes no reciben permisos de escritura.

### Autorizar cada administrador

Para cada persona:

1. En **Authentication → Users**, crea/invita la cuenta con su correo y contraseña. Asegúrate de que la cuenta esté confirmada y pueda iniciar sesión.
2. Copia su UUID de usuario.
3. En SQL Editor ejecuta una sentencia por cada usuario, sustituyendo el UUID real:

```sql
insert into public.menu_admins (user_id)
values ('UUID-REAL-DEL-USUARIO');
```

Para revocar el acceso, elimina su fila de `public.menu_admins`. No habilites la inscripción pública de administradores.

### Cómo funciona tras activarlo

- El menú público lee la configuración compartida desde Supabase.
- Los administradores entran con correo y contraseña; no se usa la contraseña local antigua como mecanismo de seguridad.
- Al guardar, la aplicación conserva una copia local y sincroniza el menú con Supabase.
- Los otros navegadores consultan actualizaciones periódicamente (intervalo inicial de 20 segundos). No es una conexión realtime instantánea.
- Las imágenes continúan subiendo a Cloudinary con la configuración que ya existía en `data.js`. La base de datos guarda las URL, no los archivos de imagen.
- Si Supabase no está configurado o hay un fallo de red, la app conserva la copia local y muestra un aviso; en ese caso el cambio no queda compartido hasta que se corrija la conexión y se guarde de nuevo.

## 3. Imágenes y Cloudinary

La configuración existente de Cloudinary se conserva en `js/data.js` (`cloudName`, `uploadPreset` y `folder`). Verifica en tu cuenta de Cloudinary que el preset unsigned `lasyulas_uploads` esté activo y limitado según las opciones disponibles. Una clave secreta de Cloudinary nunca debe incluirse en el navegador.

Las imágenes que se guardaron antiguamente solo en IndexedDB (`idb://...`) siguen estando disponibles únicamente en el navegador original. Para compartirlas, vuelve a subirlas a Cloudinary desde el editor y guarda el producto para que quede almacenada una URL pública.

## 4. Editor móvil

Se conservan las pestañas y las herramientas del editor; los ajustes CSS mejoran el tamaño de los controles, el ajuste de formularios, el espacio en pantalla, la selección de imágenes y las áreas táctiles en móviles y tablets.

## 5. Pruebas antes de darlo por producción

- Prueba el menú público sin iniciar sesión.
- Prueba el inicio de sesión con un administrador autorizado y con un usuario no autorizado.
- Cambia un precio y confirma que se sincronice; abre el menú en otro navegador y espera hasta 20 segundos.
- Sube una imagen a Cloudinary y confirma que aparece en otro dispositivo.
- Prueba el editor a 360 px de ancho y en computador.
- No compartas capturas que muestren claves privadas; la clave publicable de Supabase está diseñada para el cliente y la seguridad depende de las políticas RLS.

## Limitaciones conocidas

- GitHub Pages sigue siendo estático; Supabase es el servicio externo que aporta base de datos y autenticación.
- Esta versión no incluye edición colaborativa simultánea con resolución de conflictos: si dos administradores guardan cambios distintos al mismo tiempo, el último guardado puede reemplazar al anterior.
- El menú público se actualiza por sondeo periódico, no mediante Supabase Realtime.
- Los archivos originales no incluían la carpeta `assets/`, por lo que debes añadirla antes de publicar.
