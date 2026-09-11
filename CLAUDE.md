# Aislaciones Quilmes — sistema de gestión

## Qué es este repo

Una sola app (`index.html`): HTML + CSS + JS embebido, sin build ni dependencias.
El "backend" es un Google Apps Script (`backend-AppsScript.gs`) que lee/escribe
un Google Sheet — `index.html` le pega por HTTP (`STATE_API_URL` + `API_SECRET`,
ver el bloque `BACKEND` del script). Si `STATE_API_URL` está vacío, la app
funciona 100% en memoria (sin persistencia) — así es como se prueba sin tocar
los datos reales.

## Cómo trabajamos (acordado con el dueño)

- Para cada pedido de cambio: primero analizar el código actual y el problema,
  después plantear la propuesta concreta (diagnóstico + qué se va a tocar) y
  recién con el OK explícito del dueño, implementar.
- Todo el trabajo se commitea y pushea directo a `main` (no hay rama de
  desarrollo intermedia ni PRs — el dueño lo pidió así explícitamente).
- Antes de commitear una función nueva o un cambio de UI, probarlo en un
  navegador real (Playwright con Chromium, ya preinstalado en el entorno).
  Para no tocar el Google Sheet de producción: copiar `index.html` a un
  directorio aparte (scratchpad) y vaciar `STATE_API_URL` en esa copia antes
  de servirla — así corre en memoria y ningún test pisa datos reales.
- Los cambios al backend (`backend-AppsScript.gs`) NO se aplican solos: hay
  que pegar el archivo entero en el editor de Apps Script del Sheet real y
  volver a desplegarlo a mano. El dueño pidió agrupar varios cambios de
  backend y hacer un solo redeploy en vez de uno por feature — ver el
  checklist de abajo.

## Redeploy de Apps Script — pendiente

Estos cambios ya están en `backend-AppsScript.gs` (en `main`) pero **todavía
no se confirmó que estén desplegados** en el Apps Script real (el dueño
arregló el `SECRET` y dijo "listo", pero no llegamos a confirmar que haya
hecho también el paso de "Nueva versión" en Administrar implementaciones —
ver más abajo). Hasta que se haga el redeploy:

- [ ] `trabajadores`: campo `sueldoMensual`.
- [ ] `obras`: campo `jornalesConfigJSON` (asignación de trabajadores +
      horas extra por obra) — los campos nuevos no se guardan en el Sheet
      (se pierden al recargar).
- [ ] `stock`: campos `categoria` y `stockMinimo` (ver más abajo).
- [ ] `obras`: campo `comisionOverrideJSON` (comisión del vendedor editable
      puntualmente en la obra, ver más abajo).
- [ ] `movimientosFima`: campo `subcategoria` (ver más abajo).
- [ ] **Urgente:** fix de `doPost` para que un timeout del lock devuelva un
      error prolijo en vez de romperse sin formato (ver "Fix importante:
      guardado silencioso..." en el registro de cambios, abajo) — sin este
      redeploy, ese tipo de falla específica todavía puede quedar sin
      reintentarse bien del lado del backend.

Cuando se haga el redeploy: pegar todo `backend-AppsScript.gs` en el editor
de Apps Script del Sheet, guardar, y crear una nueva implementación (o
actualizar la existente) — ver instrucciones al principio del propio archivo.
Una vez desplegado, tildar los ítems de arriba o borrar la sección.

## Registro de cambios (funcionalidad agregada vía Claude Code)

- **Sueldos, jornales por obra y horas extra.** Trabajadores tienen sueldo
  mensual (→ sueldo diario automático, según días hábiles del mes). Cada
  obra tiene un cuadro de jornales (debajo de "Resultado parcial de obra")
  para asignar trabajadores y tildar días trabajados/ausentes en un
  calendario semanal desde la fecha de inicio de la obra, más horas extra
  ($10.000 c/u). Se refleja en Jornales (grilla + resumen mensual con sueldo
  a cobrar) y en el costo real de Mano de obra de la obra — sin generar
  gastos ni movimientos de FIMA (el pago del sueldo se sigue gestionando
  aparte, como costo fijo).
- **Stock: orden, edición, categorías y stock mínimo.** Cada material tiene
  ahora categoría (texto libre) y stock mínimo. La tabla de Stock suma:
  filtro por categoría, orden (nombre A-Z/Z-A, stock actual mayor/menor a
  menor), edición manual de cualquier campo (incluido nombre y stock actual)
  vía un link "Editar" por fila, y una alerta ("Bajo stock" en la fila +
  contador arriba de la tabla) cuando el stock actual queda por debajo del
  mínimo cargado.
- **Presupuesto: dólar de referencia, cargas sociales y comisión reordenada.**
  - El "Subtotal presupuesto" ahora también se muestra en USD (según la
    cotización de referencia cargada), tanto en el presupuesto como en la
    card "Presupuesto → Facturación" de la obra.
  - Se sacó "931 x persona" de la tabla de roles de Mano de obra (y del
    combo de puesto de trabajador en Jornales) y se agregó "Cargas
    sociales ($)" — un monto único para toda la obra, no por día.
  - Nueva cascada de cálculo: Costos → +Beneficio → +Impuestos → Subtotal
    presupuesto → −Descuento (sobre este subtotal, sin IVA) → **Subtotal
    previo de comisiones** → +Comisión vendedor (% o monto fijo, nuevo
    selector) → **Presupuesto sin IVA** → +IVA → **Presupuesto con IVA**.
    La comisión se suma aparte y ya NO resta de "Ganancia neta a
    repartir" (que ahora es simplemente Beneficio − Descuento) — no le
    come nada a los socios (AL/JL/AQ), la termina pagando el cliente.
  - En la obra real, la comisión se puede editar puntualmente (otro % u
    otro monto que el presupuestado) con el link "Editar" en la fila
    "Comisión vendedor" de "Presupuestado vs. real" — no toca el
    presupuesto original ni lo ya facturado, solo el cálculo real de esa
    obra. Si el modo es monto fijo, se prorratea según el % efectivamente
    cobrado.
- **FIMA: subcategorías por fondo.** Al registrar un movimiento (ingreso o
  egreso) en cualquier fondo, se puede cargar una subcategoría de texto
  libre (con autocompletado de lo ya usado en ese fondo — para Impuestos
  sugiere IIBB e IVA). El fondo "Obras" es la excepción: en vez de
  subcategoría, se elige la obra (usa el campo `obraId` que ya existía).
  La tabla de Movimientos de FIMA suma filtros por Fondo y por
  Subcategoría (u Obra, según el fondo elegido), y la columna "Obra" pasó
  a llamarse "Subcategoría / Obra". Al elegir un fondo en el filtro,
  aparecen cards con el saldo (ingresos − egresos) de cada subcategoría
  usada en ese fondo (u obra, si el fondo es Obras), más una card "Sin
  categorizar" / "Sin obra asignada" para lo que quedó sin esa etiqueta —
  tocar una card aplica ese filtro. No necesitó cambios de backend (usa
  los mismos campos ya agregados).
- **Fix: no colgar la app con una fila de jornales con fecha inválida.**
  `addDays()`/`mondayOf()` tiraban un error si la fecha de entrada no era
  parseable, y como eso pasaba durante el render inicial, la pantalla de
  "Cargando datos…" quedaba trabada para siempre. Ahora devuelven la
  fecha de hoy como resguardo en vez de tirar el error.
- **Eliminar trabajador.** No existía forma de borrar un trabajador — solo
  "Quitar" de una obra puntual (que no lo borraba, solo lo desasignaba de
  esa obra, por eso parecía que "volvía a aparecer"). Ahora, al editar un
  trabajador en Jornales, hay un botón "Eliminar trabajador" que lo borra
  del todo: se saca de la lista de Jornales, de la asignación/horas extra
  de cualquier obra, y **también se borra todo su historial de días
  cargados** (trabajados/ausentes) en cualquier obra — esto puede bajar
  el costo real de Mano de obra de obras que ya tenían esos días
  contabilizados (decisión tomada a pedido: se prefirió borrar todo el
  historial en vez de conservarlo).
- **"Quitar" trabajador de una obra ahora también borra sus días de esa
  obra.** Antes solo lo sacaba de la tabla de asignados, pero los días ya
  marcados "trabajado" en esa obra puntual (y sus horas extra ahí)
  quedaban contando en el costo real. Ahora "Quitar" también limpia esos
  días (vuelven a "sin obra") y las horas extra, bajando el costo real de
  Mano de obra de esa obra. No toca otras obras ni el historial del
  trabajador en general — para eso está "Eliminar trabajador".
- **Fix: "Editar" sobre un cobro importado de Excel rompía en silencio.**
  Los cobros que traía un presupuesto importado desde Excel se guardaban
  sin un `id` interno — al tocar "Editar" sobre uno de esos cobros, la
  app no encontraba a cuál se refería y no pasaba nada (sin error
  visible). Se repara solo al abrir la app (a los cobros existentes se
  les asigna un id), y los que se importen de ahora en más ya vienen con
  id.
- **PDF de Orden de Compra: "Autorizó" → "Aprobación comercial".**
- **Fix importante: se perdían datos cuando dos personas usaban la app al
  mismo tiempo.** Este es el bug de fondo detrás de varios reportes
  ("se me borró un gasto", "se me borró la asignación de un trabajador en
  una obra", "se le borró una OC a un compañero"). Cuando dos personas
  guardaban cerca en el tiempo, el sistema de sincronización (basado en
  un número de revisión, `rev`) descartaba por completo los cambios de
  quien guardaba segundo y los reemplazaba con la versión de quien guardó
  primero — el comentario del código decía que evitaba "pisar y perder"
  cambios, pero en los hechos sí los perdía.
  - **Arreglo:** ahora, ante un conflicto de guardado, la app trae la
    versión más nueva del servidor y le vuelve a sumar lo que solo
    existía localmente (un gasto nuevo, una OC nueva, un trabajador
    recién asignado a una obra, un cobro registrado, horas extra
    cargadas, etc.) antes de reintentar guardar — hasta 5 reintentos. Si
    dos personas editaron exactamente el mismo registro al mismo tiempo,
    gana quien reintenta al final (caso raro), pero ya no se pierde un
    registro nuevo agregado por cualquiera de las dos.
  - Probado con 9 pruebas unitarias de la lógica de combinación y una
    prueba de extremo a extremo con un servidor de prueba que fuerza un
    conflicto real (releer, combinar y reintentar) — quedaron guardados
    los cambios de ambas partes en el servidor.
  - **Límite conocido:** esto combina las listas de registros (gastos,
    OC, trabajadores, jornales, obras, movimientos FIMA, asignaciones
    dentro de una obra). No reconcilia números agregados que se
    actualizan aparte de esas listas — el saldo de caja y de los fondos
    de FIMA todavía pueden quedar levemente desactualizados tras un
    conflicto resuelto, hasta el próximo movimiento que los toque. Si
    notás algún saldo que no cierra justo después de un conflicto, avisá.
- **Fix importante: marcar un día en la grilla principal de Jornales no se
  guardaba.** Auditoría completa a pedido del dueño ("revisá que todo lo
  que se carga quede bien en la base de datos"). Se verificaron uno por
  uno: (a) que cada campo del esquema del backend se lea y escriba en la
  columna correcta (todo bien ahí), y (b) que cada acción que cambia
  datos dispare el guardado (`renderAll()` → `scheduleSave()`). En (b) se
  encontró que `cycleDia` y `setDiaObra` — clickear un día o elegir la
  obra en la grilla semanal de arriba de Jornales, la pantalla principal
  de uso diario — solo refrescaban la pantalla (`renderJornales()`) pero
  nunca disparaban el guardado. El cambio se veía perfecto en pantalla
  pero se perdía apenas se recargaba la página o se sincronizaba con
  otro dispositivo. Corregido para que llamen a `renderAll()` como el
  resto de la app. Confirmado con un servidor de prueba que ahora sí
  dispara el guardado y el día queda persistido.
- **Fix: la grilla principal de Jornales mostraba una semana vieja por
  defecto.** El dueño reportó que al cargar presentismo en una obra
  (ej. 3 días de un trabajador) no los veía en verde en la grilla
  principal de Jornales, aunque sí en el cuadro de personal de abajo —
  parecía que se perdían datos, pero no era así: la semana que se
  mostraba por defecto (`CURRENT_WEEK`) estaba hardcodeada a una fecha
  fija (`'2026-07-27'`) que había quedado desactualizada, así que la
  grilla arrancaba mostrando fines de julio en vez de la semana real.
  Los datos estaban bien guardados, solo no eran visibles sin navegar
  manualmente hasta esa semana. Ahora `CURRENT_WEEK` se calcula en base
  a la fecha de hoy (`mondayOf(today())`) en vez de estar fijo.
- **Nuevo: resumen de obras trabajadas por trabajador.** En el historial
  mensual de Jornales (debajo de la grilla principal), cada fila de
  trabajador tiene ahora un link "Ver obras" que abre un detalle con
  las obras en las que trabajó ese mes y cuántos días en cada una.
- **Nuevo: fecha de pago en el detalle de proveedor.** En Pagos →
  Proveedores → detalle de un proveedor, la tabla de facturas ahora
  también muestra la columna "Fecha de pago" (antes solo se veía el
  estado, sin saber cuándo vencía cada pago pendiente) — "—" si todavía
  no tiene fecha asignada.
- **Fix importante: guardado silencioso ante cualquier error que no fuera
  "conflict".** Seguían llegando reportes de que se perdía información
  (una obra recién creada, un presupuesto) después de haber arreglado el
  bug de conflictos entre usuarios. Auditando `saveState()` de nuevo se
  encontró un agujero distinto: el sistema de reintentos que combina
  cambios locales con lo del servidor **solo se activaba si el backend
  respondía específicamente `"conflict"`**. Cualquier otro tipo de falla
  (un error transitorio de Google Sheets, un corte de red, o que el
  "lock" del backend tardara más de 20 segundos en liberarse porque
  varias personas guardaban casi a la vez) se registraba en la consola
  del navegador — que nadie mira — y se abandonaba para siempre en
  silencio, sin avisar y sin reintentar. Lo cargado se veía perfecto en
  pantalla pero nunca llegaba a la planilla, y se perdía apenas se
  recargaba la página. También se encontró que en el backend
  (`backend-AppsScript.gs`), la espera del lock (`lock.waitLock`) estaba
  fuera del bloque que atrapa errores — si esa espera se agotaba, el
  backend devolvía una respuesta rota (no el JSON esperado), lo que
  también caía en el mismo agujero silencioso del lado del frontend.
  - **Arreglo:** `saveState()` ahora reintenta (combinando cambios
    locales + del servidor, igual que ya hacía para conflictos) ante
    **cualquier** error, no solo "conflict". Si después de varios
    intentos sigue sin poder guardar, la app nunca descarta lo cargado —
    muestra un aviso fijo en pantalla ("no cierres esta pestaña") y
    sigue reintentando solo en segundo plano cada 20 segundos hasta que
    se pueda. En el backend, la espera del lock ahora está dentro de un
    bloque que atrapa errores y devuelve una respuesta prolija
    (`lock_timeout`) en vez de romperse sin formato.
  - De paso se corrigió que cada reintento, al volver a pintar la
    pantalla, disparaba también su propio guardado en paralelo
    (`renderAll()` reprograma un guardado nuevo) — generaba cadenas de
    reintentos superpuestas justo cuando el problema ya era contención
    del backend. Ahora ese repintado interno no dispara guardados
    adicionales.
  - Probado con un servidor de prueba que simula fallas persistentes
    (más fallas que reintentos disponibles): se confirmó que el dato
    cargado sigue visible en pantalla sin perderse, que aparece el
    aviso, que no se generan guardados duplicados en paralelo, y que al
    recuperarse el backend el reintento en segundo plano termina
    guardando todo lo pendiente.
  - **Requiere redeploy del backend** (ver checklist arriba) — hasta que
    se haga, el arreglo del lado del backend (`lock_timeout` prolijo) no
    está activo, aunque el arreglo del frontend (reintentar ante
    cualquier error) ya ayuda por sí solo.
- **Nuevo: la app ahora se actualiza sola en segundo plano.** El dueño
  reportó que, entre dos personas usando la app a la vez, una veía datos
  que a la otra "se le borraban" (movimientos, un trabajador recién
  agregado). La causa: la app solo pedía los datos del servidor **una
  vez, al entrar** — de ahí en más una pestaña abierta nunca se enteraba
  de lo que cargaban otras personas hasta que alguien la recargaba a
  mano. No era que se borrara nada: la pantalla de quien tenía la
  pestaña abierta hacía rato quedaba "congelada" en la foto del momento
  en que había entrado.
  - **Arreglo:** ahora, mientras la app está abierta, cada 60 segundos
    (y también al volver a esa pestaña después de estar en otra, vía
    `visibilitychange`/`focus`) se trae lo último del servidor y se
    combina con lo local usando el mismo sistema de "traer y combinar"
    que ya existía para conflictos de guardado — así nunca se pisa algo
    que se esté cargando en pantalla en ese momento, y todos los
    dispositivos convergen solos. Si hay un modal abierto (alguien
    completando un formulario), el refresco se salta por completo hasta
    que se cierra, para no interrumpir una edición en curso.
  - Probado con un servidor de prueba: (a) un alta hecha "directo en el
    servidor" (simulando otro dispositivo) no aparece en una pestaña
    vieja hasta que se refresca, y después sí; (b) un refresco no pisa
    un registro cargado localmente y todavía sin guardar; (c) con un
    modal abierto el refresco no hace nada, y uno posterior (ya cerrado
    el modal) sí trae lo nuevo.
  - De paso se confirmó que "cargar un trabajador y no aparecerle a
    otra persona" era este mismo problema (el alta se guarda bien — se
    revisó `submitTrabajador` y no tiene ningún bug — solo no se veía
    reflejada todavía en la pantalla de quien no había recargado).
