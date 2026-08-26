# Cotizador

Plataforma web para generar cotizaciones a partir de documentos Word: se
sube una carta de cotización (.docx), el sistema detecta ítems, precios,
descripciones e imágenes, y permite armar, revisar y aprobar una cotización
antes de generar el documento definitivo.

Flujo: **Cargar documento → Analizar → Seleccionar ítems → Fotografías →
Datos → Borrador → Aprobar → Generar**.

Las fotografías de cada ítem vienen por defecto del documento cargado, y se
pueden quitar, reemplazar, reordenar o complementar con fotos nuevas.

## Stack

- [Next.js](https://nextjs.org) 14 (App Router, TypeScript, Server Actions) — desplegado en [Vercel](https://vercel.com)
- [Supabase](https://supabase.com) — base de datos Postgres + Storage (documentos, imágenes, logos, firmas, cotizaciones generadas)
- [`docx`](https://www.npmjs.com/package/docx) para generar el documento final
- Motor propio de lectura/edición de `.docx` (JSZip + cirugía sobre el XML de OOXML), sin dependencias nativas

## Formatos de cotización

1. **Formato original (`reutility_replica_v1`)** — el documento final es el
   *mismo archivo* que se cargó: se edita en su sitio y solo se reemplazan
   los datos. Conserva exactamente tipografía, portada, cabecera con los
   logos de Proexsi y Besttech, pie de página y diseño. Es el formato por
   defecto.
2. **Formato moderno (`carta_uf_v1`)** — documento nuevo, con tabla de ítems
   limpia, totales calculados y las fotos bajo cada ítem.

El formato se elige al crear la cotización y se puede cambiar después en el
paso "Datos".

### Cómo funciona la réplica exacta

`src/lib/docx-template/` implementa cirugía sobre el XML de OOXML: indexa los
elementos del documento conservando sus posiciones en el archivo original y
aplica reemplazos puntuales. Nunca se re-serializa el documento completo, así
que todo lo que no se toca sale **byte a byte idéntico** (hay un test de
round-trip que lo verifica).

Al analizar un documento, el parser guarda *anclas*: el índice de bloque de
cada dato editable (título, fecha, destinatario, tabla de precios, firma) y
la parte de media de cada fotografía. El renderer usa esas anclas para
escribir los valores nuevos en el mismo sitio.

Esto es lo que hace que **cualquier documento nuevo funcione igual**: al
subir la cotización de otro software, esa misma cotización se convierte en la
plantilla de su formato original.

## Arquitectura (pensada para crecer)

- `src/lib/document-parsers/` — un **parser por tipo de documento**. Hoy solo
  existe `carta_cotizacion_v1` (la carta de propuesta comercial). Para
  soportar un nuevo tipo de documento, se agrega un archivo nuevo y se
  registra en `registry.ts`, sin tocar el resto de la app.
- `src/lib/quote-renderers/` — un **renderer por formato de cotización de
  salida**, registrado en su `registry.ts`.
- `src/lib/docx-template/` — el motor de edición de .docx que usan tanto el
  parser (para leer) como el renderer de réplica (para escribir), lo que
  garantiza que los índices de ambos siempre coincidan.
- `src/lib/quotes/render.ts` — arma el documento. Lo usan tanto la descarga
  del borrador como la generación definitiva, así que lo que se aprueba es
  exactamente lo que se descarga.
- `document_types` / `quote_formats` (tablas en Supabase) son el catálogo que
  conecta documentos y cotizaciones con la implementación correcta.
- `src/lib/actions/` — Server Actions (mutaciones): documentos, cotizaciones,
  logos, firmantes.

## Configuración

1. Copia `.env.example` a `.env.local` y completa:
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY`: desde el dashboard de Supabase (Settings → API).
   - `APP_PASSWORD`: contraseña compartida para acceder a la app (ver nota de seguridad abajo).
   - `APP_SESSION_SECRET`: cualquier string aleatorio.
2. `npm install`
3. `npm run dev`

El esquema de base de datos y los buckets de Storage ya están provisionados
en el proyecto Supabase del equipo (`supabase/schema.sql` documenta el
esquema completo, por si hay que recrearlo).

### Nota de seguridad (v1)

Todavía no hay sistema de usuarios. La app completa está protegida por una
sola contraseña compartida, que se cambia desde **Configuración → Cambiar
contraseña**. Se guarda con hash PBKDF2 en la tabla `app_settings`, no en una
variable de entorno, así que cambiarla no requiere redesplegar. `APP_PASSWORD`
solo se usa para el primer acceso, mientras no haya ninguna guardada.

Como la cookie de sesión se deriva del hash almacenado, cambiar la contraseña
cierra todas las sesiones abiertas.
Las políticas RLS en Supabase dan acceso completo a la clave `anon` porque
todas las consultas se hacen desde el servidor de Next.js — esa clave nunca
se expone al navegador. Si más adelante se necesita control de acceso por
usuario, reemplazar este gate por Supabase Auth y ajustar las políticas RLS.

## Despliegue

Conectado a Vercel vía GitHub — cada push a `main` despliega automáticamente.
Variables de entorno (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_PASSWORD`,
`APP_SESSION_SECRET`) se configuran en el proyecto de Vercel.
