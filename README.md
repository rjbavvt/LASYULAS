# LAS YULAS · Menú Digital

Menú gastronómico web **100% editable** sin frameworks ni procesos de compilación.
HTML5 + CSS3 + JavaScript vanilla (ES Modules). Inspirado en la imagen de referencia de
"LAS YULAS" (categoría *HOT DOGS* con 4 productos de ejemplo).

> **Requisito fundamental:** todo el contenido visual y textual (logotipo, banner, productos,
> precios, colores, tipografías, etc.) se carga dinámicamente desde `js/data.js` o desde el panel
> visual integrado. No hay contenido "quemado" en el HTML.

---

## ✨ Características

- **Renderizado dinámico** desde `js/data.js`: agrega o elimina productos/categorías sin tocar el HTML.
- **Panel de edición visual** integrado (botón "Editar menú"):
  - Edición de marca (negocio, logo, banner, pie de página).
  - Edición de estilos (colores, tipografías, layout, radios, visibilidad de elementos).
  - CRUD completo de **categorías** y **productos** (crear, editar, duplicar, eliminar, reordenar, ocultar/mostrar, marcar agotado).
  - Variantes / tamaños por producto.
  - **Exportar / importar** configuración como archivo JSON.
  - **Restablecer** datos de demostración (con confirmación).
- **Persistencia local**:
  - `localStorage` guarda la configuración (texto, precios, referencias).
  - `IndexedDB` almacena las imágenes seleccionadas por el usuario (no se usan Base64 en `localStorage`).
- **Imágenes**:
  - Soporta rutas locales (`assets/...`) y URLs externas (`https://...`).
  - Selector de archivos local con `URL.createObjectURL` + IndexedDB.
  - `object-fit: cover`, `object-position` configurable vía CSS.
  - Carga diferida (`loading="lazy"`) en productos fuera de la zona inicial.
  - Imagen de respaldo (fallback) cuando una URL falla.
  - Compatibilidad con JPG, PNG, WebP y AVIF.
- **Diseño responsive**:
  - Móvil pequeño: 1 columna.
  - Móvil grande / tablet: 1–2 columnas.
  - Escritorio: 2 columnas (configurable hasta 4).
  - Pantallas amplias: máximo 2 columnas y ancho controlado.
- **Estética editorial gastronómica**: fondo negro, alto contraste, tipografía condensed,
  imágenes grandes con esquinas redondeadas, badges promocionales, estado de agotado.

---

## 📁 Estructura del proyecto

```
menu-digital/
├── index.html              · Estructura mínima (contenido inyectado por JS)
├── css/
│   └── styles.css          · Estilos, variables CSS y responsive
├── js/
│   ├── data.js             · Configuración global y contenido del menú
│   └── app.js              · Render dinámico + panel de edición
├── assets/
│   ├── logo.png            · Logotipo de LAS YULAS
│   ├── banner.jpg          · Banner horizontal de categoría
│   └── products/
│       ├── sencilla.jpg
│       ├── especial.jpg
│       ├── mixta.jpg
│       └── doble-carne.jpg
└── README.md               · Este archivo
```

---

## 🚀 Cómo ejecutar el proyecto

### Requisito: servidor estático

Este proyecto usa **ES Modules** (`import`/`export` en `data.js`/`app.js`).
Abrir `index.html` directamente con `file://` **NO funcionará** por restricciones de CORS del navegador.

Necesitas servir el proyecto desde un servidor local. Elige una opción:

#### Opción A — Python (ya viene en la mayoría de sistemas)

```bash
cd menu-digital
python3 -m http.server 8765
```

Luego abre: <http://localhost:8765/>

#### Opción B — Node.js (`http-server` o `serve`)

```bash
# Instalar una sola vez
npm install -g http-server

cd menu-digital
http-server -p 8765
```

O con `serve`:

```bash
npx serve menu-digital -l 8765
```

#### Opción C — VS Code

Instala la extensión **Live Server** y haz clic derecho sobre `index.html` → *Open with Live Server*.

---

## ✏️ Cómo editar el menú

### Modo 1 — Editar el código directamente (recomendado para despliegue)

Abre `js/data.js` y modifica los valores. La interfaz se actualizará automáticamente al recargar.

Ejemplo — cambiar un precio:

```javascript
// js/data.js
{
  id: "sencilla",
  name: "SENCILLA",
  description: "Pan, carne, lechuga, tomate, ripio y salsas.",
  price: 18000,         // ← cambia este valor
  image: "assets/products/sencilla.jpg",
  // ...
}
```

### Modo 2 — Panel visual integrado (recomendado para usuarios no técnicos)

1. Abre la página en el navegador.
2. Haz clic en el botón **"Editar menú"** (abajo a la derecha).
3. Edita lo que necesites desde las pestañas:
   - **General** · Negocio, logo, banner, pie de página.
   - **Estilos** · Colores, tipografías, layout, visibilidad.
   - **Categorías** · Crear, editar, duplicar, eliminar, reordenar, ocultar.
   - **Productos** · Igual que categorías, con variantes y precios.
   - **Datos** · Exportar / importar JSON, restablecer demo.
4. Pulsa **Guardar**. Los cambios se almacenan localmente en ese navegador.

> ⚠️ **Importante:** los cambios guardados con el panel solo afectan al navegador donde se
> hicieron. No se publican automáticamente a otros dispositivos. Para compartir la configuración:
> 1. Exporta el archivo JSON desde la pestaña **Datos**.
> 2. Sustituye manualmente el contenido de `js/data.js` por ese JSON (o intégralo en tu
>    proceso de despliegue).
> 3. Vuelve a desplegar el sitio.

---

## 🎨 Personalización rápida

| Quiero cambiar… | En el panel | O en `data.js` |
|---|---|---|
| Nombre del negocio | General → "Nombre del negocio" | `businessName` |
| Logotipo | General → "Logotipo" | `logo.src` |
| Banner | General → "Banner superior" | `banner.image`, `banner.title` |
| Colores | Estilos → "Color…" | `theme.background`, `theme.accent`, … |
| Tipografías | Estilos → "Fuente…" | `typography.headingFont`, `typography.bodyFont` |
| Número de columnas | Estilos → "Columnas" | `layout.columns` |
| Formato de precios | — | `currency.locale`, `currency.code` |
| Pie de página | General → "Pie de página" | `footer.*` |

---

## 🖼️ Imágenes

Cada producto, categoría y el banner admiten imágenes independientes.

- **URL remota**: pega una URL `https://…` en el campo de imagen del panel.
- **Archivo local**: usa el botón **📂 Subir archivo**. El archivo se guarda en IndexedDB
  y se referencia como `idb://<id-único>` en la configuración.

Formatos soportados: JPG, PNG, WebP, AVIF.

---

## 🔧 Detalles técnicos

- **Sin dependencias externas** (excepto Google Fonts para tipografías Anton/Inter, que puedes
  reemplazar por fuentes locales editando `typography.headingFont` y `typography.bodyFont`).
- **Sin frameworks** ni proceso de compilación.
- **Accesibilidad**: textos alternativos obligatorios para todas las imágenes, navegación por
  teclado en el panel (`ESC` para cerrar), roles ARIA en el modal.
- **Rendimiento**: imágenes fuera de pantalla con `loading="lazy"`, fallback automático en
  caso de error de carga.

---

## 📤 Despliegue en producción

El proyecto es estático. Cualquier hosting de archivos estáticos sirve:

- **Netlify / Vercel**: arrastra la carpeta `menu-digital/`.
- **GitHub Pages**: sube el contenido a la rama `gh-pages` o usa la carpeta `docs/`.
- **Cualquier hosting compartido** (Hostinger, cPanel, etc.): sube por FTP.

No necesita Node, ni PHP, ni base de datos en el servidor.

---

## 📝 Licencia

Proyecto de demostración para *Las Yulas*. Las imágenes incluidas se generaron con IA para
propósitos de muestra; reemplázalas por las fotografías reales del negocio antes de publicar.