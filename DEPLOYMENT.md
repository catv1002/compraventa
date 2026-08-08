# Despliegue

Dos ambientes, mismo stack: **Staging** (rama `develop`, para pruebas) y **Production** (rama `main`, cuando esté lista para clientes reales). Cada uno con su propio backend (Railway) y su propio frontend (Cloudflare Pages) — no comparten base de datos.

Lo de esta página que requiere entrar a Railway/Cloudflare con tu cuenta lo tienes que hacer tú — no hay forma de automatizarlo desde el repo. Lo que sí quedó listo en el código: `railway.json` (build/start), `apps/frontend/public/_redirects` (rutas de React Router), y `start:prod` corriendo las migraciones antes de arrancar.

## 1. Backend en Railway

### 1.1 Crear el proyecto (una sola vez)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → selecciona `catv1002/compraventa`.
2. Railway va a intentar autodetectar el build — ignóralo, ya está resuelto por `railway.json` en la raíz del repo (usa Nixpacks, instala con workspaces, compila y arranca solo el workspace `apps/backend`). **No cambies el "Root Directory" a `apps/backend`** — tiene que quedar en `/` (raíz) para que el `npm ci` vea el `package-lock.json` del monorepo.
3. Dentro del proyecto, click **+ New** → **Database** → **PostgreSQL**. Railway inyecta `DATABASE_URL` automáticamente al servicio del backend — no la definas tú a mano.

### 1.2 Variables de entorno del servicio backend

Ve a tu servicio → **Variables** y agrega (usa `apps/backend/.env.example` como referencia de cuáles existen):

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Generar con `openssl rand -base64 48` — **una distinta por ambiente**, nunca la del `.env.example` |
| `JWT_ACCESS_TOKEN_TTL` | `8h` (o lo que decidan) |
| `JWT_REFRESH_TOKEN_TTL` | `7d` |
| `CORS_ORIGIN` | La URL del frontend de *este mismo ambiente* (ver paso 2) — puede llevar varias separadas por coma |
| `PORT` | No la definas — Railway inyecta la suya y `main.ts` la respeta |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_ENDPOINT` | Credenciales del bucket de Cloudflare R2 de este ambiente (recomendado: un bucket de pruebas para Staging, otro para Production) |
| `MFA_BYPASS` | No la pongas (o déjala en `false`) — `auth.service.ts` la ignora igual si `NODE_ENV=production`, pero es más claro no tenerla |
| `NODE_ENV` | `production` — Railway la pone sola en la mayoría de templates, confírmalo en Variables |

### 1.3 Ambientes (Staging vs. Production) dentro del mismo proyecto

Railway soporta múltiples *environments* por proyecto sin duplicar configuración:

1. En el proyecto, arriba a la izquierda, el selector de ambiente → **New Environment** → nómbralo `staging`.
2. Conecta ese ambiente a la rama `develop` (Settings del servicio → **Source** → branch `develop`).
3. Agrega ahí su propio plugin de PostgreSQL y sus propias variables (JWT_SECRET distinto, CORS_ORIGIN apuntando al preview de Cloudflare Pages).
4. El ambiente `production` (el que Railway crea por defecto) lo conectas a la rama `main` cuando la crees.

### 1.4 Primer deploy y seed

El primer deploy corre `prisma migrate deploy` automáticamente (parte de `start:prod`), así que las tablas quedan creadas solas. El seed (`prisma/seed.ts`, crea el tenant/sucursal/usuario admin de prueba) **no corre automático** — es deliberado, no quieres reseeder producción por accidente. Para correrlo una vez en un ambiente:

```bash
railway run --service backend --environment staging npx ts-node prisma/seed.ts
```

(requiere el [Railway CLI](https://docs.railway.app/guides/cli) autenticado con `railway login`).

## 2. Frontend en Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → selecciona el mismo repo.
2. Configuración de build:
   - **Root directory**: `apps/frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. **Environment variables** (por ambiente — Cloudflare Pages distingue Production de Preview en la misma pantalla):
   - `VITE_API_URL` = la URL pública del backend de Railway correspondiente a este ambiente (ej. `https://compraventa-staging.up.railway.app` para preview/staging, `https://api.tudominio.com` para production).
4. **Production branch**: `main`. Cualquier otra rama (incluida `develop`) genera automáticamente un *preview deployment* con su propia URL (`https://<hash>.compraventa.pages.dev`) — no hay que configurar nada más para tener el ambiente de pruebas del frontend.

Importante: `VITE_API_URL` se hornea en el build (Vite la resuelve en tiempo de compilación, no en runtime) — si la cambias, tienes que volver a desplegar, no basta con reiniciar.

## 3. Orden recomendado para dejar Staging funcionando hoy

1. Crear el proyecto Railway apuntando a `develop`, con su Postgres, y sus variables (usa un `JWT_SECRET` generado ahora, no el de ejemplo).
2. Anotar la URL pública que Railway le asigna al backend.
3. Crear el proyecto Cloudflare Pages apuntando al mismo repo, con `VITE_API_URL` = esa URL de Railway.
4. Anotar la URL de preview que Cloudflare le asigna al frontend.
5. Volver a Railway y poner `CORS_ORIGIN` = esa URL de Cloudflare (si ya habías desplegado, esto dispara un redeploy solo del backend).
6. Correr el seed una vez (paso 1.4) para tener un usuario con el que entrar.

## 4. Cuándo pasar a Production

Cuando el negocio esté listo para clientes reales: crear la rama `main` desde `develop`, repetir los pasos 1.3 (nuevo Railway environment `production` apuntando a `main`) y 2 (Cloudflare production branch ya es `main` por defecto, solo agregar sus variables), con `JWT_SECRET`, base de datos y bucket R2 **propios y distintos** de Staging — nunca reutilizar credenciales de pruebas en producción.

Ver también: [docs/08-arquitectura-tecnica.md §6](docs/08-arquitectura-tecnica.md#6-cloud-railway--cloudflare-fase-1-2--aws-fase-3) para el resto del plan de infraestructura por fases (AWS a partir de Fase 3).
