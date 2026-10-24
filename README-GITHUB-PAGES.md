# LAS YULAS · Publicación en GitHub Pages + Supabase

Esta versión tiene los siguientes cambios ya aplicados:

- ✅ **Errores 404 corregidos** en `index.html` y `data.js`: ahora referencian los archivos `favicon.ico` y `logo_lasyulas.png` que están en la raíz del repositorio (estructura plana, sin carpeta `assets/`).
- ✅ **`emailField` no está duplicado** en `app.js`. La declaración aparece una sola vez dentro de `openChangePasswordDialog()`. Si veías el error antes, ya no lo verás.
- ✅ **`cloud-config.js` ya configurado** con la URL del proyecto Supabase y la clave publicable.
- ✅ **`cloudChangePassword()` existe en `cloud.js`** y ahora **se usa desde `app.js`** cuando Supabase está configurado. El cambio de contraseña actualiza la contraseña real de la cuenta en Supabase; el modo local con SHA-256 sigue disponible como respaldo si no hay nube.
- ✅ **Estructura del menú conservada**: la categoría Perros calientes y los productos Hamburguesa Sencilla y Hamburguesa Especial siguen sin duplicarse.

## Estructura del repositorio (plana)

```
/
├── index.html
├── .nojekyll
├── README.md                  (descripción general del proyecto)
├── README-GITHUB-PAGES.md     (este archivo)
├── app.js                     (render + editor + auth)
├── cloud.js                   (capa Supabase REST)
├── cloud-config.js            (URL + anon key — ya configurado)
├── data.js                    (configuración y menú base)
├── styles.css
├── favicon.ico
├── logo_lasyulas.png
└── supabase-setup.sql         (ejecutar en Supabase SQL Editor)
```

## 1. Publicación en GitHub Pages

1. Sustituye el contenido de la rama principal del repositorio `rjbavvt/LASYULAS` por estos archivos. Mantén mayúsculas/minúsculas de los nombres.
2. Conserva el archivo `.nojekyll` en la raíz (evita que Jekyll procese los módulos ES y respete las mayúsculas).
3. En GitHub, ve a **Settings → Pages → Deploy from a branch**, selecciona la rama principal y carpeta `/(root)`.
4. Tras 1–2 minutos, el sitio estará disponible en:
   `https://rjbavvt.github.io/LASYULAS/`

> **Importante**: no abras el `index.html` con `file://` directamente. ES Modules requiere servir desde un servidor (GitHub Pages, `python -m http.server`, etc.).

## 2. Configurar Supabase (paso único)

`cloud-config.js` ya tiene la URL y la clave publicable. Solo falta ejecutar el SQL y registrar los administradores:

1. Entra a Supabase → tu proyecto → **SQL Editor**.
2. Pega el contenido completo de `supabase-setup.sql` y ejecútalo.
3. Verifica que se crearon las tablas `public.menu_config` y `public.menu_admins` y las políticas RLS.

### Registrar cada administrador

Para cada persona que pueda editar el menú:

1. En **Authentication → Users**, crea o invita la cuenta con correo y contraseña. Asegúrate de que la cuenta esté confirmada.
2. Copia el `User UID` que aparece en la tabla de usuarios.
3. En SQL Editor, ejecuta:

```sql
insert into public.menu_admins (user_id)
values ('PEGA-AQUÍ-EL-UUID-REAL');
```

4. Repite por cada administrador. Para revocar acceso: `delete from public.menu_admins where user_id = 'UUID';`.

## 3. Probar antes de dar por production-ready

Sigue este orden antes de avisar a los demás administradores:

### 3.1 Menú público (sin login)

- [ ] Abrir `https://rjbavvt.github.io/LASYULAS/` en una pestaña en modo incógnito.
- [ ] Confirmar que el favicon y el logo cargan (sin errores 404 en la consola de red).
- [ ] Confirmar que las categorías Perros calientes, Hamburguesas, Arepas y Salchipapas se ven correctamente.
- [ ] Confirmar que el botón "Editar menú" aparece pero al pulsarlo pide correo + contraseña.

### 3.2 Inicio de sesión

- [ ] Iniciar sesión con un administrador autorizado → debe entrar al editor.
- [ ] Iniciar sesión con un usuario NO autorizado (cualquier correo válido en Supabase pero no en `menu_admins`) → debe rechazar con "La cuenta inició sesión, pero no está autorizada...".
- [ ] Cerrar sesión desde el botón del editor → debe pedir login de nuevo.

### 3.3 Cambio de contraseña

- [ ] Dentro del editor, pestaña **Datos → 🔑 Cambiar contraseña**.
- [ ] Introducir contraseña actual (la de Supabase), nueva y confirmación.
- [ ] Pulsar "Actualizar" → debe aparecer el toast "Contraseña actualizada en Supabase...".
- [ ] Cerrar sesión y volver a iniciar con la nueva contraseña → debe funcionar.
- [ ] Probar con contraseña actual incorrecta → debe mostrar error sin cambiar nada.

### 3.4 Sincronización multi-administrador

- [ ] En el navegador A (admin 1): iniciar sesión, cambiar un precio, guardar.
- [ ] En el navegador B (admin 2, otro equipo o incógnito): iniciar sesión, abrir el editor y comprobar que el cambio del admin 1 aparece visible.
- [ ] Repetir en sentido inverso.
- [ ] En el navegador C (sin login, solo menú público): esperar hasta 20 segundos y comprobar que los precios actualizados aparecen sin recargar manualmente.

### 3.5 Editor móvil

- [ ] En el navegador del móvil o con DevTools en modo responsive (360px de ancho):
- [ ] El editor se abre y los campos son usables con teclado táctil.
- [ ] Las pestañas (General, Estilos, Categorías, Productos, Datos) son navegables.
- [ ] El botón "Guardar" está al alcance del pulgar.

### 3.6 Imágenes

- [ ] Subir una imagen a Cloudinary desde un producto → debe quedar guardada con URL pública.
- [ ] Abrir el menú en otro dispositivo → la imagen debe aparecer.

## 4. Limitaciones y buenas prácticas

- No publiques ni hagas commit de la `service_role` key de Supabase. La `anon`/publishable ya en `cloud-config.js` es segura para el frontend porque las políticas RLS bloquean escrituras no autorizadas.
- El sondeo del menú público es cada 20 s (configurable en `cloud-config.js → pollIntervalMs`). No es realtime instantáneo.
- Si dos administradores guardan cambios distintos al mismo segundo, el último guardado reemplaza al anterior. No hay resolución de conflictos.
- GitHub Pages sirve archivos estáticos. Supabase es el único servicio dinámico.
- Si necesitas cambiar la URL o la anon key, edita únicamente `cloud-config.js` y vuelve a hacer push.

## 5. Completar contenido del menú

Una vez estabilizado y publicado, completa desde el editor:

- Precios en productos que dicen "Consultar precio" (`price: null` en `data.js`).
- Descripciones o ingredientes pendientes.
- Imágenes de productos (sube a Cloudinary desde el editor para que queden como URL pública compartida).
- Datos del footer: teléfono, dirección, enlaces sociales.

Cualquier cambio guardado por un admin se sincroniza automáticamente con todos los navegadores que consulten el menú.
