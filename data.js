/* =========================================================================
 * LAS YULAS - Menú Digital
 * data.js  ·  Configuración global y contenido del menú
 *
 * Este archivo centraliza TODO el contenido editable del menú.
 * Modifica aquí los valores y la interfaz se actualizará automáticamente.
 *
 * Soporta ES Modules. Para ejecutar la app es necesario un servidor
 * estático (no abrir index.html con file://). Ver README.md.
 *
 * ESQUEMA DE PRODUCTO (campos):
 *   id           · Identificador interno único y estable (kebab-case).
 *   name         · Nombre visible del producto.
 *   shortName    · Nombre corto automático (slug sin acentos, sin prefijo
 *                  de categoría). Se usa para construir imageId.
 *   imageId      · Identificador lógico de la imagen:
 *                  `<shortName>_<categoria.shortName>`.
 *   description  · Descripción breve basada en ingredientes.
 *   price        · Precio numérico (COP). null => "Consultar precio".
 *   oldPrice     · Precio anterior (opcional, se muestra tachado).
 *   image        · Ruta local, URL externa o referencia IndexedDB.
 *   imageAlt     · Texto alternativo accesible (auto si está vacío).
 *   badge        · Etiqueta promocional opcional.
 *   available    · true = disponible, false = agotado.
 *   visible      · true = visible en el menú público.
 *   order        · Orden de aparición dentro de la categoría.
 *   variants     · Variantes o tamaños opcionales.
 *
 * ESQUEMA DE CATEGORÍA:
 *   id, name, title, description, bannerImage, bannerAlt, visible, order,
 *   shortName · Nombre corto de la categoría (sin espacios ni acentos).
 *
 * IDEMPOTENCIA + TOMBSTONES:
 *   app.js fusiona esta configuración con la guardada en localStorage,
 *   añadiendo solo categorías/productos que aún no existan. Las
 *   eliminaciones hechas por el usuario se registran en
 *   `deletedProductIds` y `deletedCategoryIds` para que no vuelvan
 *   a aparecer tras recargar. Ver app.js (migrateConfig).
 * ========================================================================= */

export const menuConfig = {
  /* -------- Identidad del negocio -------- */
  businessName: "LAS YULAS",
  businessTagline: "Sabor callejero colombiano",

  /* -------- Logotipo -------- */
  logo: {
    src: "./logo_lasyulas.png",
    alt: "Logotipo LAS YULAS con gallo rojo",
    width: 110,
    visible: true
  },

  /* -------- Banner superior -------- */
  banner: {
    visible: true,
    image: "./logo_lasyulas.png",
    alt: "Hot dogs colombianos sobre tabla de madera",
    title: "HOT DOGS",
    subtitle: "Hechos al carbón, con salsas de la casa",
    overlay: 0.55
  },

  /* -------- Paleta y tipografía -------- */
  theme: {
    background: "#000000",
    surface: "#111111",
    surfaceAlt: "#1A1A1A",
    text: "#FFFFFF",
    textMuted: "#D0D0D0",
    textSubtle: "#9A9A9A",
    accent: "#E51B16",
    accentSoft: "rgba(229, 27, 22, 0.18)",
    success: "#2ECC71",
    warning: "#F1C40F",
    divider: "rgba(255,255,255,0.08)"
  },

  typography: {
    headingFont: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
    bodyFont: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
    baseSize: 16,
    headingTransform: "uppercase",
    headingWeight: 800
  },

  layout: {
    maxWidth: 1200,
    contentPadding: 24,
    columns: 2,
    gridGap: 28,
    cardGap: 18,
    imageRatio: "1 / 1",
    imageRadius: 18,
    cardRadius: 22,
    bannerHeight: "44vh",
    bannerHeightMobile: "32vh"
  },

  /* -------- Formato de precios -------- */
  currency: {
    code: "COP",
    locale: "es-CO",
    symbol: "$",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    position: "prefix"
  },

  /* -------- Visibilidad de elementos opcionales -------- */
  visibility: {
    showHeader: true,
    showBanner: true,
    showCategoryTitle: true,
    showCategoryDescription: true,
    showProductDescription: true,
    showFooter: true,
    showEditButton: true,
    showPriceOld: true,
    showBadges: true,
    showAvailability: true
  },

  /* -------- Protección del panel de edición --------
   * El botón "Editar menú" solo se abre tras introducir una contraseña.
   *
   * ⚠️ AVISO DE SEGURIDAD IMPORTANTE:
   * Esta protección se ejecuta en el navegador del cliente. Cualquier persona
   * con conocimientos técnicos podría inspeccionar el código y saltársela.
   * Sirve como barrera para evitar ediciones accidentales o por personal no
   * autorizado, pero NO reemplaza un backend con autenticación real.
   *
   * La contraseña por defecto es:  lasyulas2026
   * Cámbiala desde el panel (pestaña "Datos" → "Cambiar contraseña") y luego
   * exporta el JSON y reemplaza el contenido de js/data.js para que el cambio
   * sea permanente en el despliegue.
   *
   * El valor almacenado es un hash SHA-256, no la contraseña en texto plano.
   */
  editorAuth: {
    enabled: true,
    // Hash SHA-256 de la contraseña por defecto "lasyulas2026"
    passwordHash: "9244516a7754c3e0d11cd4445ba5f64ebf70b43fae8ede0880df211f426ed612",
    // Minutos de sesión antes de volver a pedir la contraseña
    sessionTimeoutMinutes: 30
  },

  /* -------- Imagen de respaldo -------- */
  fallbackImage:
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>` +
        `<rect width='100%' height='100%' fill='#1a1a1a'/>` +
        `<text x='50%' y='50%' fill='#666' font-family='sans-serif' font-size='22' text-anchor='middle' dominant-baseline='middle'>Imagen no disponible</text>` +
        `</svg>`
    ),

  /* -------- Pie de página -------- */
  footer: {
    text: "LAS YULAS · Sabor que enamora",
    copyright: "© 2026 Las Yulas. Todos los derechos reservados.",
    social: [
      { label: "Instagram", url: "https://instagram.com/lasyulas", visible: true },
      { label: "WhatsApp", url: "https://wa.me/573000000000", visible: true },
      { label: "Ubicación", url: "https://maps.google.com/?q=Las+Yulas", visible: false }
    ],
    contactPhone: "+57 300 000 0000",
    contactAddress: "Calle 100 #50-25, Bogotá, Colombia"
  },

  /* -------- Tombstones --------
   * IDs de productos y categorías que el usuario ha eliminado.
   * migrateConfig no los volverá a añadir aunque existan en este archivo.
   * Se vacían al "Restablecer demo" o al importar un JSON nuevo.
   */
  deletedProductIds: [],
  deletedCategoryIds: [],

  /* -------- Cloudinary (subida de imágenes) --------
   * Configuración para que el panel de edición suba imágenes a la nube.
   * El "upload preset" sin firmar permite subir desde el navegador sin
   * exponer el API secret. Las imágenes se suben con un public_id fijo
   * (basado en imageId del producto) para que se reemplacen al actualizar.
   *
   * Si cloudName o uploadPreset están vacíos, la app usa IndexedDB local
   * (comportamiento anterior) en lugar de la nube.
   */
  cloudinary: {
    cloudName: "f4ldvi97",
    uploadPreset: "lasyulas_uploads",
    folder: "lasyulas",
    invalidateOnUpload: true
  },

  /* -------- Categorías y productos --------
   * shortName se usa para construir imageId: <prod.shortName>_<cat.shortName>
   * Para los productos existentes se conserva la imagen original (assets/...);
   * los productos nuevos tienen image: null hasta que el usuario la adjunte.
   */
  categories: [
    /* ===== PERROS CALIENTES (HOT DOGS) ===== */
    {
      id: "hot-dogs",
      name: "PERROS CALIENTES",
      title: "PERROS CALIENTES",
      shortName: "hot_dogs",
      description: "Nuestras salchichas al carbón con pan brioche y salsas de la casa.",
      bannerImage: "./logo_lasyulas.png",
      bannerAlt: "Hot dogs de la casa sobre tabla de madera",
      visible: true,
      order: 1,
      products: [
        {
          id: "perro-super",
          name: "Perro Súper",
          shortName: "super",
          imageId: "super_hot_dogs",
          description: "Pan brioche, salchicha, queso derretido, papa ripio, lechuga, tomate y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 1,
          variants: []
        },
        {
          id: "perro-americano",
          name: "Perro Americano",
          shortName: "americano",
          imageId: "americano_hot_dogs",
          description: "Pan brioche, salchicha, tocineta, queso americano, maíz dulce y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 2,
          variants: []
        },
        {
          id: "perro-suizo",
          name: "Perro Suizo",
          shortName: "suizo",
          imageId: "suizo_hot_dogs",
          description: "Pan brioche, salchicha, queso suizo derretido, tocino, champiñones y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 3,
          variants: []
        }
      ]
    },

    /* ===== HAMBURGUESAS ===== */
    {
      id: "burgers",
      name: "HAMBURGUESAS",
      title: "HAMBURGUESAS",
      shortName: "burgers",
      description: "Hamburguesas recién armadas con pan brioche y salsas de la casa.",
      bannerImage: null,
      bannerAlt: "",
      visible: true,
      order: 2,
      products: [
        {
          id: "hamburguesa-sencilla",
          name: "Hamburguesa Sencilla",
          shortName: "sencilla",
          imageId: "sencilla_burgers",
          description: "Pan brioche, carne a la parrilla, queso, lechuga, tomate y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 1,
          variants: []
        },
        {
          id: "hamburguesa-especial",
          name: "Hamburguesa Especial",
          shortName: "especial",
          imageId: "especial_burgers",
          description: "Pan brioche, carne a la parrilla, jamón, queso, huevo, lechuga, tomate y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 2,
          variants: []
        },
        {
          // Producto dual "Mixta o Doble Carne": el nombre corto se deriva
          // del primero de los términos. Si prefieres uno solo, renómbralo
          // desde el panel de edición.
          id: "hamburguesa-mixta-doble-carne",
          name: "Hamburguesa Mixta o Doble Carne",
          shortName: "mixta",
          imageId: "mixta_burgers",
          description: "Pan brioche, doble carne a la parrilla, pollo, jamón, queso amarillo, tocineta, huevo, lechuga, tomate y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 3,
          variants: []
        }
      ]
    },

    /* ===== AREPAS Y TUMBARANCHO ===== */
    {
      id: "arepas",
      name: "AREPAS Y TUMBARANCHO",
      title: "AREPAS Y TUMBARANCHO",
      shortName: "arepas",
      description: "Arepas asadas al momento y tumbarancho tradicional con rellenos de la casa.",
      bannerImage: null,
      bannerAlt: "",
      visible: true,
      order: 3,
      products: [
        {
          id: "reina-pepiada-arepas",
          name: "Arepa Reina Pepiada",
          shortName: "reina_pepiada",
          imageId: "reina_pepiada_arepas",
          description: "Aguacate, pollo desmechado y queso.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 1,
          variants: []
        },
        {
          id: "pabellon-arepas",
          name: "Arepa Pabellón",
          shortName: "pabellon",
          imageId: "pabellon_arepas",
          description: "Caraotas negras, carne desmechada, tajada de plátano y queso.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 2,
          variants: []
        },
        {
          id: "pelua-arepas",
          name: "Arepa Pelúa",
          shortName: "pelua",
          imageId: "pelua_arepas",
          description: "Carne desmechada y queso.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 3,
          variants: []
        },
        {
          id: "domino-arepas",
          name: "Arepa Dominó",
          shortName: "domino",
          imageId: "domino_arepas",
          description: "Caraotas negras y queso.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 4,
          variants: []
        },
        {
          id: "sifrina-arepas",
          name: "Arepa Sifrina",
          shortName: "sifrina",
          imageId: "sifrina_arepas",
          description: "Carne asada y queso.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 5,
          variants: []
        },
        {
          id: "chorizo-arepas",
          name: "Arepa de Chorizo",
          shortName: "chorizo",
          imageId: "chorizo_arepas",
          description: "Chorizo y queso.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 6,
          variants: []
        },
        {
          id: "cabimera-arepas",
          name: "Arepa Cabimera",
          shortName: "cabimera",
          imageId: "cabimera_arepas",
          description: "Jamón, queso, huevo, lechuga y tomate.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 7,
          variants: []
        },
        {
          id: "tumbarancho-arepas",
          name: "Tumbarancho",
          shortName: "tumbarancho",
          imageId: "tumbarancho_arepas",
          description: "Mortadela, queso, lechuga y tomate.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 8,
          variants: []
        }
      ]
    },

    /* ===== SALCHIPAPAS Y PICADAS ===== */
    {
      id: "salchipapas",
      name: "SALCHIPAPAS Y PICADAS",
      title: "SALCHIPAPAS Y PICADAS",
      shortName: "salchipapas",
      description: "Papas crujientes con salsas de la casa, ideales para compartir.",
      bannerImage: null,
      bannerAlt: "",
      visible: true,
      order: 4,
      products: [
        {
          id: "sencilla-salchipapas",
          name: "Salchipapa Sencilla",
          shortName: "sencilla",
          imageId: "sencilla_salchipapas",
          description: "Papas, salchicha, queso, papa ripio y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 1,
          variants: []
        },
        {
          id: "personal-salchipapas",
          name: "Picada Personal",
          shortName: "personal",
          imageId: "personal_salchipapas",
          description: "Papas, chorizo, pollo, cerdo, queso y salsas de la casa.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 2,
          variants: []
        },
        {
          id: "familiar-salchipapas",
          name: "Picada Familiar",
          shortName: "familiar",
          imageId: "familiar_salchipapas",
          description: "Papas, chorizo, pollo, cerdo, queso y salsas de la casa. Porción familiar.",
          price: null,
          oldPrice: null,
          image: null,
          imageAlt: "",
          badge: null,
          available: true,
          visible: true,
          order: 3,
          variants: []
        }
      ]
    }
  ]
};

export default menuConfig;
