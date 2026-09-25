# Pruebas de sincronización entre pestañas / dispositivos

Corren la app en Chromium (Playwright) contra `backend-AppsScript.gs` **real**
ejecutado sobre un Google Sheet simulado en memoria (`gas-server.js`) — no
tocan la planilla de producción.

Preparar las dos copias de la app (la actual, y opcionalmente la de un commit
viejo para simular una pestaña con la versión anterior):

```
cd tests/sincronizacion
sed -e "s#^const STATE_API_URL = '.*';#const STATE_API_URL = 'http://127.0.0.1:8770/';#" \
    -e "s#^const API_SECRET = '.*';#const API_SECRET = 'test';#" ../../index.html > nuevo.html
git show <commit-viejo>:index.html | sed -e "s#^const STATE_API_URL = '.*';#const STATE_API_URL = 'http://127.0.0.1:8770/';#" \
    -e "s#^const API_SECRET = '.*';#const API_SECRET = 'test';#" > viejo.html
node sync-tests.js
```

(`nuevo.html` / `viejo.html` son copias generadas — no se commitean.)
