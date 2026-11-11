# Puente Bsale → Walmart México

Aplicación web para sincronizar inventario desde Bsale hacia Walmart Marketplace México y supervisar cada ejecución. Funciona inicialmente en modo simulación y mantiene bloqueada la escritura real hasta que el operador la habilite en el servidor.

## Qué incluye

- Lectura paginada de `GET /v1/stocks.json` de Bsale, con `quantityAvailable` por variante y sucursal.
- Correspondencia directa entre el código de variante de Bsale y el SKU de Walmart.
- Consulta de `GET /v3/inventory` y actualización de `PUT /v3/inventory` en Walmart.
- Autenticación OAuth 2.0 de Walmart con renovación automática del token de corta duración.
- Stock de seguridad, filtro de catálogo, sucursal y ship node configurables.
- Ejecuciones manuales, programadas y reintentos de SKU fallidos.
- Historial persistente de cantidades, errores HTTP y correlation ID.
- Simulación sin llamadas de escritura, sandbox y producción limitada a un SKU confirmado.
- Acceso al panel mediante usuario y contraseña cuando se instala en el Droplet.
- Base de datos MySQL exclusiva y sincronización programada desactivada por defecto.

## Credenciales necesarias para una prueba real

No las escribas en el código ni las envíes por canales públicos. Se configuran únicamente en `.env` del Droplet:

1. **Bsale:** `BSALE_ACCESS_TOKEN`, con acceso a consultar stock. También necesitas el ID de la sucursal que alimentará Walmart.
2. **Walmart:** `WALMART_CLIENT_ID` y `WALMART_CLIENT_SECRET`, obtenidos en Seller Center → API Integration → API Key Management.
3. **Opcional:** `WALMART_CHANNEL_TYPE`, solamente si Walmart te entregó un Consumer Channel Type durante el onboarding.
4. Los SKU ya deben existir en el catálogo de Walmart. Esta versión sincroniza inventario en una sola dirección; no crea publicaciones, no modifica precios y no descarga pedidos de Walmart hacia Bsale.

Referencias oficiales:

- [Documentación de Bsale](https://docs.bsale.dev/)
- [Walmart Inventory API](https://developer.walmart.com/global-marketplace/lang-es/docs/inventory-api-overview)
- [Walmart Token API](https://developer.walmart.com/global-marketplace/docs/get-an-access-token-using-token-api)
- [Actualizar inventario](https://developer.walmart.com/global-marketplace/lang-es/reference/updateinventoryforanitem)

## Instalación aislada en DigitalOcean

Requisitos: Docker Engine y el plugin Docker Compose v2. No es necesario detener nginx, Apache, Node, PM2, bases de datos ni otros contenedores existentes.

1. Copia este proyecto en una carpeta nueva, por ejemplo `/opt/puente-bsale-walmart`, y entra en ella.
2. Crea la configuración local:

   ```bash
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

3. Define tres contraseñas diferentes: `DASHBOARD_PASSWORD`, `MYSQL_ROOT_PASSWORD` y `MYSQL_APP_PASSWORD`. Deja `SYNC_MODE=simulation` y `ALLOW_WALMART_WRITES=false` durante la instalación.
4. Comprueba que el puerto elegido esté libre. Si `3100` aparece ocupado, cambia `APP_PORT` en `.env`; no detengas el proceso que lo esté usando:

   ```bash
   ss -ltn | grep ':3100'
   docker compose config -q
   ```

5. Construye e inicia solamente este proyecto:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

6. Revisa los registros sin detener el servicio. Sal de los registros con `Ctrl+C`; eso no detiene los contenedores:

   ```bash
   docker compose logs -f app
   ```

El nombre del proyecto, la red y el volumen son específicos de esta integración. El panel se publica únicamente en `127.0.0.1`; no modifica el proxy inverso ni el firewall del Droplet.

## Abrir el panel de forma segura

Sin cambiar la configuración de tu servidor web, crea un túnel desde tu computadora:

```bash
ssh -L 3100:127.0.0.1:3100 USUARIO@IP_DEL_DROPLET
```

Después abre `http://localhost:3100` e inicia sesión con `DASHBOARD_USER` y `DASHBOARD_PASSWORD`. Si cambiaste `APP_PORT`, usa ese puerto en ambos lados del túnel.

Para asignarle posteriormente un dominio y HTTPS, agrega una ubicación nueva en tu proxy actual hacia `127.0.0.1:3100`. Esa configuración debe revisarse según el proxy que ya tengas; este paquete no la modifica automáticamente.

## Secuencia recomendada de validación

1. Ejecuta **Nueva sincronización → Simulación** y revisa la bitácora.
2. Agrega las credenciales en `.env` y reinicia únicamente la aplicación de este proyecto:

   ```bash
   docker compose up -d --force-recreate app
   ```

3. Pulsa **Probar credenciales**. Esta acción solo lee Bsale y solicita un token a Walmart; no actualiza inventario.
4. En **Reglas de inventario**, configura sucursal, stock de seguridad, ship node y una lista pequeña de SKU permitidos.
5. Si tienes acceso a sandbox de Walmart, selecciona ese entorno y valida allí la actualización.
6. Para una única prueba real, cambia en `.env`:

   ```dotenv
   ALLOW_WALMART_WRITES=true
   ```

   Vuelve a crear solo el contenedor de la aplicación con el comando del paso 2. Después selecciona **Producción**, escribe un SKU y confirma exactamente `ACTUALIZAR TU-SKU`.
7. Compara el resultado en Seller Center antes de ampliar el catálogo. La programación debe permanecer pausada hasta completar esta validación.

## Sincronización automática

La frecuencia y el estado se editan en el panel. El entorno de las ejecuciones programadas se define con `SYNC_MODE`:

- `simulation`: calcula y registra, sin escribir.
- `sandbox`: utiliza `https://sandbox.walmartapis.com`.
- `production`: utiliza `https://marketplace.walmartapis.com`; requiere `ALLOW_WALMART_WRITES=true`.

No actives `production` para todo el catálogo sin antes configurar una lista de SKU permitidos y verificar las reglas de stock.

## Operación y reversibilidad

- Ver estado: `docker compose ps`
- Ver registros: `docker compose logs --tail=200 app`
- Actualizar solo la aplicación: `docker compose up -d --build app`
- Detener únicamente esta integración: `docker compose down`

`docker compose down` conserva el volumen `puente_bsale_walmart_mysql_data`, por lo que el historial permanece. No uses `down -v` ni comandos de limpieza general de Docker si quieres conservar datos o recursos de otros proyectos.

## Desarrollo y comprobaciones

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev
```

```bash
npm run check
npm run test
npm run build
npm audit --omit=dev
```

La aplicación puede instalarse como PWA desde un navegador compatible. En el Droplet, la API nunca se almacena en caché por el service worker.
