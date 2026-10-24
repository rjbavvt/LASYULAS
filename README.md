# LAS YULAS · Menú Digital

Menú digital interactivo para **LAS YULAS** — hot dogs al carbón con salsas de la casa. App web estática publicada en GitHub Pages, con sincronización multi-administrador vía Supabase y almacenamiento de imágenes en Cloudinary.

🔗 **Demo en producción**: [https://rjbavvt.github.io/LASYULAS/](https://rjbavvt.github.io/LASYULAS/)

---

## 👤 Autor

**Desarrollado por**: Rjbavtt, YouKnow.
**Instagram**: [@rjbavvt](https://instagram.com/rjbavvt)
**Soporte técnico**: jorg3ribavt@gmail.com

© 2026 Rjbavtt, YouKnow. Todos los derechos reservados.

Para soporte, cambios o nuevos proyectos de menú digital, contactar al correo arriba indicado.

---

## 🎯 Características

- **Menú público** responsive (móvil y escritorio) con categorías, productos, precios, descripciones e imágenes.
- **Editor visual** integrado — sin necesidad de tocar código para actualizar precios, textos o fotos.
- **Multi-administrador** con autenticación real en Supabase — varias cuentas pueden editar el menú.
- **Sincronización automática** entre dispositivos (sondeo cada 20 s).
- **Cambio de contraseña** desde el propio editor (modifica la contraseña real en Supabase).
- **Subida de imágenes** a Cloudinary con URL pública compartida entre dispositivos.
- **Importar/Exportar JSON** para backup o migración manual.
- **Tipografía Outfit** y paleta oscura con acento rojo, optimizada para comida callejera.
- **Cero costos de hosting** — GitHub Pages + capa gratuita de Supabase + Cloudinary.

---

## 🛠 Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES Modules) |
| Hosting | GitHub Pages (estático, con `.nojekyll`) |
| Autenticación | Supabase Auth (correo + contraseña) |
| Base de datos | Supabase Postgres + RLS |
| Imágenes | Cloudinary (upload preset unsigned) |
| Tipografía | Outfit (Google Fonts) |

---

## 📁 Estructura del repositorio

```
LASYULAS/
├── index.html                  · Estructura HTML + modales
├── app.js                       · Render + editor + auth
├── cloud.js                     · Capa de Supabase REST
├── cloud-config.js              · URL + anon key (públicas)
├── data.js                      · Configuración y contenido del menú
├── styles.css                   · Estilos y responsive
├── favicon.ico
├── logo_lasyulas.png
├── supabase-setup.sql           · SQL para crear tablas y políticas
├── .nojekyll                    · Desactiva Jekyll en GitHub Pages
├── README.md                    · Este archivo
└── README-GITHUB-PAGES.md       · Guía de publicación detallada
```

---

## 🚀 Puesta en producción (resumen)

1. Subir todos los archivos a la rama `main` del repositorio GitHub.
2. Activar **Settings → Pages → Deploy from branch** (`main` / `/(root)`).
3. Crear proyecto en [Supabase](https://supabase.com/), copiar Project URL y anon key en `cloud-config.js`.
4. Ejecutar `supabase-setup.sql` en Supabase SQL Editor.
5. Crear usuarios en **Authentication → Users** y registrar sus UUID en `menu_admins`.
6. Configurar Cloudinary (cloudName + uploadPreset en `data.js`).

Pasos detallados en `README-GITHUB-PAGES.md`.

---

## 🔐 Seguridad

- **No se publican claves privadas** en el frontend. La `anon key` de Supabase en `cloud-config.js` es segura para el cliente porque las políticas RLS bloquean escrituras no autorizadas.
- La `service_role` key de Supabase **nunca** se incluye en el código del navegador.
- Cloudinary usa upload preset *unsigned*, sin API secret en el frontend.
- Las contraseñas se gestionan en Supabase Auth (estándar de la industria, con hash bcrypt interno).

---

## 📝 Uso del editor (para administradores del negocio)

1. Abrir `https://rjbavvt.github.io/LASYULAS/`
2. Pulsar botón **"✎ Editar menú"** (abajo a la derecha).
3. Introducir correo + contraseña de administrador.
4. Editar precios, descripciones, imágenes, categorías o productos.
5. Pulsar **Guardar** → los cambios se sincronizan con todos los dispositivos en hasta 20 s.
6. Para cambiar la contraseña: pestaña **Datos → 🔑 Cambiar contraseña**.

---

## ⚠️ Limitaciones conocidas

- La sincronización es por sondeo cada 20 s, no es tiempo real instantáneo.
- No hay edición simultánea con resolución de conflictos: si dos administradores guardan al mismo tiempo, el último sobrescribe.
- GitHub Pages puede tardar 1-2 minutos en refrescar tras un nuevo commit (caché del CDN).
- Las imágenes guardadas en IndexedDB (modo local sin nube) **no se comparten** entre navegadores — para compartirlas deben subirse a Cloudinary desde el editor.

---

## 📜 Licencia

Código y diseño © 2026 **Jorge Eliecer Ribaut Villadiego**.

Uso comercial exclusivo para **LAS YULAS**. Para licenciar esta plantilla para otros negocios, contactar a jorg3ribavt@gmail.com.

---

## 📞 Contacto

- **Soporte técnico**: jorg3ribavt@gmail.com
- **Instagram**: [@rjbavvt](https://instagram.com/rjbavvt)
- **Repositorio**: [github.com/rjbavvt/LASYULAS](https://github.com/rjbavvt/LASYULAS)
- **Sitio público**: [rjbavvt.github.io/LASYULAS](https://rjbavvt.github.io/LASYULAS/)
