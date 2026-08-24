# Cotizador

Plataforma web para generar cotizaciones a partir de documentos Word: se
sube una carta de cotización (.docx), el sistema detecta ítems, precios,
descripciones e imágenes, y permite armar, revisar y aprobar una cotización
antes de generar el documento definitivo.

Flujo: **Cargar documento → Analizar → Seleccionar ítems → Fotografías →
Datos → Borrador → Aprobar → Generar**.

## Stack

- [Next.js](https://nextjs.org) 14 (App Router, TypeScript, Server Actions) — desplegado en [Vercel](https://vercel.com)
- [Supabase](https://supabase.com) — base de datos Postgres + Storage (documentos, imágenes, logos, firmas, cotizaciones generadas)
- [`docx`](https://www.npmjs.com/package/docx) para generar el documento final
- Parser propio de `.docx` (JSZip + fast-xml-parser), sin dependencias nativas

## Arquitectura (pensada para crecer)

- `src/lib/document-parsers/` — un **parser por tipo de documento**. Hoy solo
  existe `carta_cotizacion_v1` (la carta de propuesta comercial). Para
  soportar un nuevo tipo de documento, se agrega un archivo nuevo y se
  registra en `registry.ts`, sin tocar el resto de la app.
- `src/lib/quote-renderers/` — un **renderer por formato de cotización de
  salida**. Hoy solo existe `carta_uf_v1`. Nuevos formatos de cotización se
  agregan igual, registrándose en `registry.ts`.
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
sola contraseña compartida (`APP_PASSWORD`, revisada en `src/middleware.ts`).
Las políticas RLS en Supabase dan acceso completo a la clave `anon` porque
todas las consultas se hacen desde el servidor de Next.js — esa clave nunca
se expone al navegador. Si más adelante se necesita control de acceso por
usuario, reemplazar este gate por Supabase Auth y ajustar las políticas RLS.

## Despliegue

Conectado a Vercel vía GitHub — cada push a `main` despliega automáticamente.
Variables de entorno (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_PASSWORD`,
`APP_SESSION_SECRET`) se configuran en el proyecto de Vercel.
