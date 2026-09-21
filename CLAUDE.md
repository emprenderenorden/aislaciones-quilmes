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

El dueño confirmó (11/09) que el redeploy con el `SECRET` corregido **sí**
se hizo, y que ese redeploy incluyó estos campos de esquema (ya estaban en
`backend-AppsScript.gs` en ese momento) — se dan por desplegados:

- [x] `trabajadores`: campo `sueldoMensual`.
- [x] `obras`: campo `jornalesConfigJSON` (asignación de trabajadores +
      horas extra por obra).
- [x] `stock`: campos `categoria` y `stockMinimo`.
- [x] `obras`: campo `comisionOverrideJSON` (comisión del vendedor editable
      puntualmente en la obra).
- [x] `movimientosFima`: campo `subcategoria`.

El dueño confirmó (20/09) que además se hizo el redeploy que agrupaba los
siguientes cuatro cambios de esquema — pegó `backend-AppsScript.gs`
completo en el editor de Apps Script y creó una nueva versión de la
implementación:

- [x] Fix de `doPost` para que un timeout del lock devuelva un error
      prolijo (`lock_timeout`) en vez de romperse sin formato.
- [x] `ordenesCompra`: campo `moneda` (para las OC cargadas en dólares).
- [x] `movimientosFima`: campo `id`.
- [x] `ordenesCompra`: campos `obraIds` y `pagoIds` (para las OC
      repartidas entre varias obras).

No hay ningún redeploy pendiente por ahora. Cuando se sume un cambio de
backend nuevo, se anota acá como pendiente y se agrupan varios antes de
volver a desplegar (ver instrucciones al principio de
`backend-AppsScript.gs`).

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
- **Nuevo: editar y eliminar un movimiento de FIMA.** No existía forma de
  borrar ni de corregir un movimiento ya cargado en FIMA (ni el título ni
  el monto) — el dueño probó borrarlo directo en la planilla y tampoco
  funcionó, porque la app reescribe la hoja entera en cada guardado (así
  que cualquier borrado manual ahí se pisa solo). Ahora cada fila de la
  tabla de Movimientos tiene "Editar" (para corregir concepto y monto) y
  "Eliminar".
  - Al eliminar o editar el monto, se ajusta el saldo del fondo
    correspondiente. Si el movimiento era un egreso cargado directo desde
    "Registrar movimiento" (que también generó su propio gasto en Pagos,
    y no una cuota parcial de una factura que ya existía de antes), ese
    gasto vinculado se actualiza o se borra junto con el movimiento, para
    no dejarlo desincronizado o huérfano.
  - Los movimientos de FIMA no tienen `id` propio (se identifican por
    contenido, ver `unionPorContenido`) — Editar/Eliminar apuntan a la
    posición del movimiento dentro de `state.movimientosFima`, no a la
    lista filtrada/ordenada que se ve en pantalla, así apuntan siempre al
    registro correcto aunque haya dos movimientos con el mismo contenido.
  - Probado en un entorno aislado: ingreso con edición de monto y
    eliminación posterior (saldo del fondo queda en $0 al final); egreso
    que genera un gasto propio, edición de monto (se refleja en el gasto
    vinculado también) y eliminación (borra el movimiento y el gasto
    vinculado, devuelve el saldo al fondo).
- **Fix crítico: un borrado podía "resucitar" solo.** El dueño reportó que
  borraba movimientos de FIMA y volvían a aparecer. La causa era de fondo,
  no específica de FIMA: el sistema de "traer y combinar" (usado tanto al
  reintentar un guardado con conflicto como en el auto-refresco) arma el
  resultado tomando **la lista del servidor como base** y sumándole lo que
  solo existe en lo local — pero un borrado hace que un registro exista
  *solo en el servidor* (porque local ya no lo tiene), exactamente la
  misma forma que algo "nuevo, todavía sin guardar". El sistema no podía
  distinguir "esto lo acabo de borrar" de "esto todavía no llegué a
  cargarlo del otro lado" — y en el primer caso, el merge lo traía de
  vuelta. Esto afectaba **cualquier borrado** en la app (trabajador,
  gasto, obra, movimiento de FIMA), no solo a FIMA — probablemente detrás
  de varios reportes previos de "esto se borra y después vuelve".
  - **Arreglo:** cada `eliminar`/`quitar` ahora registra en memoria (dura
    lo que dura la pestaña) qué se borró — el id para las colecciones con
    id (trabajadores, pagos, órdenes de compra, obras, stock,
    movimientos de stock, jornales) o la firma completa del contenido
    para movimientos de FIMA (que no tienen id propio). El merge, antes
    de tomar la lista del servidor como base, saca de ahí cualquier cosa
    marcada como borrada — así nunca la resucita, la haya guardado ya el
    servidor o no. También se aplicó a "editar un movimiento de FIMA"
    (que, al no tener id, para el sistema de merge es como borrar el
    contenido viejo y agregar uno nuevo — sin la marca, un conflicto en
    el medio podía dejar duplicada la versión vieja y la editada).
  - **Bug relacionado, encontrado en el camino:** el auto-refresco (el
    de cada 60s / al volver a la pestaña, agregado el mismo día) tenía
    un atajo — "si el número de revisión no cambió, no hago nada" — para
    no repintar la pantalla sin necesidad. Pero ese chequeo se hacía
    *después* de que `loadState()` ya había sobreescrito todo `state`
    con la copia cruda del servidor, así que cuando la revisión no había
    cambiado (que es justo lo más común: pasa cada vez que hay un
    cambio local recién hecho que todavía no se guardó), la función se
    cortaba ahí sin llegar a combinar nada — dejando la copia cruda del
    servidor pisando cualquier cambio local sin guardar (no solo un
    borrado: también una alta o edición reciente). Se sacó ese atajo —
    ahora siempre combina.
  - Probado con un servidor de prueba forzando conflictos y también
    llamando al refresco automático a mano en el medio de un borrado:
    eliminar un trabajador, un gasto con pago real (que también borra su
    movimiento de FIMA vinculado) y un movimiento de FIMA sobreviven los
    tres a un conflicto de guardado forzado y al auto-refresco — ninguno
    volvió a aparecer ni en pantalla ni en el servidor al final.
  - **Alcance de este arreglo:** cubre las colecciones "planas" del
    estado (arriba). Quedan afuera, con el mismo tipo de riesgo teórico
    pero mucho menos frecuentes: quitar a un trabajador de una obra
    puntual (la asignación dentro de `jornalesConfig`) y quitar un
    documento de una obra — esos se combinan de forma anidada por obra
    y no se les agregó todavía la misma marca de "borrado". Si notás que
    alguno de esos dos vuelve a aparecer, avisá para extender el
    arreglo ahí también.
- **Nuevo: editar una orden de compra ya autorizada o comprada.** El link
  "Editar" en Órdenes de compra solo aparecía con la OC en estado
  Pendiente — el mecanismo para editar ya andaba para cualquier estado
  (`submitOrdenCompra` no chequea el estado), solo faltaba mostrar el
  link. Ahora también aparece en Autorizada y Comprada.
  - Al editar una OC ya marcada como Comprada (que generó su propio pago
    real en Pagos y sumó su monto al costo real de la obra en el momento
    de confirmarla), el monto nuevo se refleja también en ese pago
    vinculado y en el costo real de la obra — restando lo que se había
    sumado antes y sumando lo nuevo, para no quedar desincronizado ni
    duplicar el ajuste. Si además se cambia la obra o categoría de
    destino, el ajuste se revierte de la obra/categoría vieja y se aplica
    en la nueva.
  - **Ojo con un detalle no obvio:** el monto que había quedado sumado al
    costo real de la obra no es el monto *estimado* de la OC (que nunca
    se actualiza al marcarla comprada) sino el monto *final* que se cargó
    en el pago al confirmar la compra — pueden ser distintos (el de
    "Marcar como comprada" se escribe a mano, no se recalcula de los
    ítems). El ajuste usa ese monto final del pago para revertir, no el
    estimado de la OC — si hubiera usado el estimado, el costo real de la
    obra habría quedado mal.
  - Probado en un entorno aislado: crear OC → autorizar → marcar
    comprada por $12.000 (el costo real de la obra sube a $12.000) →
    editar la OC subiendo el monto a $15.000 → el pago vinculado y el
    costo real de la obra quedan en $15.000 (no en $17.000, que hubiera
    sido el resultado de restar mal el estimado en vez del monto real).
- **Fix crítico: el auto-refresco podía pisar una edición recién hecha
  (asignar una fecha de pago, marcar una compra como pagada).** Efecto
  colateral del fix anterior ("un borrado podía resucitar solo"): para
  arreglar eso hubo que sacarle al auto-refresco un atajo que se saltaba
  la combinación cuando la revisión no había cambiado. Pero sacar ese
  atajo tuvo una consecuencia no vista en su momento: el auto-refresco
  (cada 60s, o al volver a la pestaña) pasó a combinar **siempre**,
  incluso en el momento exacto en que hay una edición local recién hecha
  todavía sin guardar (el debounce de guardado espera ~900ms). Y el
  sistema de combinación, para un registro que ya existe en las dos
  listas (mismo pago, misma orden), siempre elige la versión del
  servidor — que en ese momento todavía no tiene el cambio recién hecho.
  Antes del fix del borrado, esto pasaba poco (el atajo lo evitaba la
  mayoría de las veces); después, pasaba cada vez que el auto-refresco
  corría en ese margen de menos de un segundo — mucho más frecuente de
  lo que parece si alguien cambia de pestaña justo después de guardar
  algo (dispara el refresco por `focus`).
  - **Arreglo:** se agregó una marca (`hayGuardadoPendiente`) que queda
    en `true` desde que se programa un guardado hasta que se confirma
    guardado con éxito. El auto-refresco ahora se salta por completo
    (ni siquiera pide datos al servidor) mientras esa marca esté en
    `true` — así nunca compite con una edición propia todavía sin
    confirmar. Apenas termina el guardado, el siguiente refresco (como
    mucho 60 segundos después) sigue trayendo tranquilo los cambios de
    los demás.
  - Probado con un servidor de prueba: asignar una fecha de pago a un
    gasto y, en el medio de la espera del guardado (antes de que
    termine), forzar un refresco automático a mano — la fecha asignada
    sigue en pantalla y termina guardada bien en el servidor. Un
    refresco posterior, ya sin nada pendiente, sigue trayendo cambios
    de otros dispositivos con normalidad. Se reconfirmó además que el
    fix del borrado (registro anterior) sigue funcionando junto con
    este cambio.
- **Nuevo: cargar una orden de compra en dólares.** La "Cotización USD"
  de la OC era solo un dato informativo que se imprimía en el PDF — no
  convertía nada, así que si el proveedor cotizaba en USD había que
  convertir a mano antes de tipear los precios unitarios.
  - Ahora la OC tiene un selector "Moneda de los ítems" (Pesos / Dólares,
    Pesos por defecto — las OC existentes no cambian). Si se elige
    Dólares, los precios unitarios de los ítems se cargan en USD, la
    "Cotización USD" pasa a ser obligatoria (antes era opcional — no se
    puede guardar sin ella), y el resumen del formulario muestra el
    subtotal en USD y su equivalente en pesos.
  - El monto final de la orden — el que se usa para todo lo demás
    (autorizar, IVA, costo real de la obra) — **siempre queda en pesos**:
    subtotal en USD × cotización cargada, más IVA si aplica. El pago real
    (al marcarla como comprada) sigue siendo 100% en pesos como ya era,
    sin ningún cambio ahí — el campo "Monto final" se sigue prellenando
    ya convertido a pesos.
  - El PDF de la orden (imprimirOrden) muestra los precios unitarios y el
    subtotal en dólares cuando corresponde, más el total en pesos y la
    cotización usada, para que quede clara la conversión.
  - Probado en un entorno aislado: intentar guardar en USD sin cotización
    (bloquea con aviso), cargar con cotización y confirmar el monto en
    pesos calculado bien (con y sin IVA), reabrir para editar y verificar
    que moneda/cotización/etiquetas se repueblan bien, imprimir y
    confirmar que el PDF muestra los montos en USD y en pesos, marcar
    como comprada y confirmar que el monto final prellenado ya viene
    convertido a pesos, y que una OC común en pesos sigue funcionando
    exactamente igual que antes.
  - **Requiere redeploy del backend** (`ordenesCompra.moneda`, ver
    checklist arriba) — el campo se agregó al final del esquema (no
    corre las columnas existentes), así que mientras no se despliegue,
    el monto en pesos ya calculado se guarda y persiste bien, pero la
    distinción "esta OC se cargó en dólares" se pierde al recargar la
    página (vuelve a leerse como si fuera en pesos).
- **Fix: la carga inicial no reintentaba.** El dueño reportó "a veces
  actualizo la página y no aparece información, al volver a actualizar
  ahí aparece todo". La causa: la carga de datos al abrir/recargar la
  app (`loadState()` en `bootstrap()`) no tenía ningún reintento — si el
  primer pedido al backend fallaba por algo transitorio (arranque en
  frío de Apps Script, un hipo de red), la app se quedaba con el estado
  vacío por defecto y lo mostraba tal cual, sin avisar. Apretar
  "Actualizar" de nuevo disparaba una carga nueva que esta vez sí salía
  bien — de ahí la sensación de que "a veces sí, a veces no".
  - **Arreglo:** la carga inicial ahora reintenta sola, con una pausa
    que va creciendo (1,5s, 3s, hasta un máximo de 8s entre intentos),
    hasta lograrlo — no se rinde nunca (sin datos la app no sirve para
    nada, así que reintentar indefinidamente es lo correcto acá, a
    diferencia de un guardado donde si se sigue fallando hay que avisar
    y no perder lo cargado). Mientras reintenta, el cartel de "Cargando
    datos…" se queda en pantalla y cambia a "No se pudo conectar con la
    base de datos, reintentando… (intento N)" en vez de sacarse y
    mostrar la app vacía como si no hubiera datos.
  - Probado con un servidor de prueba que simula que las primeras 2
    cargas fallan (como un arranque en frío) y la 3ra sale bien: el
    cartel de carga se queda visible con el mensaje de reintento durante
    las fallas, y una vez que logra cargar, se saca solo y la app
    termina mostrando los datos reales (no una pantalla vacía). Una
    carga normal, sin fallas, sigue siendo instantánea — no se le agregó
    ninguna demora de por sí.
- **Fix importante: una edición podía perderse si su guardado chocaba con
  un conflicto AJENO y sin relación.** El dueño reportó "registraron
  asistencia en una obra y se borró". Investigado con una prueba
  controlada: se confirmó que marcar un día como trabajado en el cuadro
  de jornales de una obra se perdía en silencio si, en el momento de
  guardar, el guardado chocaba con CUALQUIER conflicto (de cualquier
  otro registro, de cualquier otra persona) — no hacía falta que nadie
  más hubiera tocado esa fila de jornales en particular.
  - **Causa de fondo:** el sistema de "combinar tras un conflicto"
    (compartido por el reintento de guardado y el auto-refresco) resolvía
    todo registro que ya existiera en las dos listas (local y servidor)
    siempre a favor del servidor — una regla pensada para no pisar la
    edición de otra persona al mismo registro. Pero como esa regla no
    distinguía "otra persona editó esto" de "yo edité esto y el conflicto
    fue por otra cosa", cualquier edición propia a un registro que ya
    existía se perdía apenas el guardado chocaba por cualquier motivo. Al
    auditar a fondo se encontró que esto no era exclusivo de jornales:
    aplicaba a **cualquier edición sobre un registro ya existente** en
    pagos, órdenes de compra, proveedores, stock, trabajadores, cobros de
    una obra (`ingresosList`) y varios campos de nivel superior de la obra
    (estado, costo real, código/cliente/encargado/fecha, presupuesto,
    facturación, "sin cobros pendientes") — este último grupo ni siquiera
    estaba identificado como riesgo en los registros anteriores de este
    archivo.
  - **Arreglo:** se agregó un registro de "esto lo edité yo" (separado del
    ya existente registro de "esto lo borré yo"), que vive mientras dura
    la pestaña. Cada acción que edita un registro existente (asignar
    fecha de pago, marcar un día de jornales, editar una orden de compra,
    iniciar una obra, registrar un gasto que suma al costo real, etc.)
    anota qué tocó. Al combinar tras un conflicto: si ESTA pestaña editó
    ese registro (o, en jornales, ese día puntual; o, en la obra, ese
    campo puntual) desde el último sync, gana la versión local; si no lo
    tocamos, se sigue respetando la del servidor tal cual — para no pisar
    una edición ajena a algo que ni nos importaba en ese momento, aunque
    tuviéramos en memoria una copia vieja de ese registro. En jornales,
    el día se resuelve celda por celda (no fila entera) para no
    resucitar por error un día que el usuario, en el medio del conflicto,
    justo acababa de limpiar a propósito (un click legítimo, no un día
    "sin tocar").
  - **Ojo con un detalle no obvio (y por qué la primera idea se
    descartó):** la solución más simple —"ante un conflicto, mi versión
    local siempre gana"— se evaluó y se rechazó: haría que un registro
    que otra persona edita en el servidor, y que esta pestaña ni tocó
    (pero tenía en memoria una copia vieja, simplemente por tenerla
    cargada en pantalla), se pisara solo porque un conflicto ocurrió por
    cualquier otro motivo — exactamente el mismo tipo de pérdida de datos
    que se estaba arreglando, solo que en la dirección opuesta. Por eso
    el arreglo final es puntual (por registro, por día de jornal, por
    campo de obra editado), no una regla general de "local gana".
  - Probado: (a) se repitió la prueba original que reproducía el bug
    reportado (marcar dos días de jornales en una obra, forzando un
    conflicto ajeno entre medio) — ahora los dos días sobreviven; (b)
    prueba específica para el caso que motivó descartar "local siempre
    gana": un cambio hecho por "otra persona" directo en el servidor, que
    esta pestaña nunca tocó, se sigue trayendo bien tras un conflicto
    (no se pisa con la copia vieja en memoria); (c) un pago con fecha de
    pago recién asignada, el estado de una obra recién iniciada y el
    costo real de una obra tras registrar un gasto sobreviven un
    conflicto de guardado genuino (no solo la carrera de auto-refresco ya
    cubierta antes); (d) los 16 tests de regresión existentes (tombstones,
    confiabilidad de guardado, auto-refresco, conflictos, FIMA, órdenes de
    compra en dólares, presupuesto, eliminar trabajador, etc.) se
    volvieron a correr contra el código nuevo y siguen pasando.
  - **Alcance / lo que queda igual que antes:** esto no toca el caso ya
    documentado y aceptado como poco frecuente de "dos personas editando
    el EXACTO mismo campo del EXACTO mismo registro al mismo tiempo"
    (ahí sigue ganando quien reintenta al final). Tampoco cierra los dos
    gaps de "borrado sin marca" que ya estaban anotados como pendientes
    en el registro anterior (quitar un documento de una obra, y quitar la
    asignación de un trabajador a una obra vía `jornalesConfig.asignados`
    — estos son casos de "borrado que puede resucitar", no de "edición
    que se pierde", y quedan afuera de este arreglo puntual). Si notás
    que alguno de estos dos casos vuelve a pasar, avisá para extenderlo.
- **Fix crítico: el costo real de una obra (Materiales, sobre todo) podía
  quedar mal calculado, incluso en negativo.** El dueño reportó una obra
  con "Materiales" en `-$4.582.792` en Presupuestado vs. real, a pesar de
  que los gastos cargados en la tabla eran todos positivos y correctos.
  - **Causa de fondo:** `real` (el costo real de la obra: materiales, mano
    de obra, logística, estadía, otros) **no se calculaba solo** — era un
    contador que se sumaba y restaba a mano en 7 lugares distintos del
    código (registrar/editar/eliminar un gasto, marcar una orden de compra
    como comprada, editar una OC ya comprada, consumir stock). Cualquier
    bug histórico en cualquiera de esos puntos — incluidos varios que ya
    arreglamos este mismo día (conflictos de guardado, borrados que
    resucitaban, el auto-refresco pisando una edición) — podía haber
    restado de más en algún momento, y como nada volvía a calcularlo desde
    cero, el error quedaba pegado ahí para siempre. Es lo opuesto a
    "Ingresos (cobrado)", que nunca tiene este problema porque se
    recalcula entero desde la lista de cobros cada vez, en vez de
    mantenerse como contador.
  - **Arreglo:** `real` ahora se calcula siempre desde el origen real de la
    plata (`recomputeObraReal()`) — la suma de los gastos de la obra
    (`pagos` con `tipo:'obra'`) más el consumo de stock de esa obra
    (`stockMovimientos` tipo `consumo`, que no genera un gasto propio) — en
    vez de mantenerse a mano. Se recalcula después de cualquier alta,
    edición o baja que toque esas listas, y también después de combinar
    tras un conflicto de guardado (reemplazando el seguimiento por campo
    que se le había agregado a `real` en el arreglo anterior — dejó de
    hacer falta, porque ya no es un valor que haya que elegir entre la
    versión local o la del servidor). Al editar una orden de compra ya
    comprada y cambiarla de obra o categoría, el pago vinculado ahora
    también actualiza su `obraId`/`categoria` (antes se quedaban con el
    valor viejo, silenciosamente, porque `real` se ajustaba a mano y
    "tapaba" el hecho de que el pago había quedado desincronizado).
  - **Reparación automática al abrir la app:** además de prevenir el
    problema hacia adelante, `bootstrap()` ahora recalcula el `real` de
    todas las obras una vez al cargar (`repararRealObras()`, mismo patrón
    que ya existía para fechas corruptas, pagos programados vencidos y
    jornales viejos) y, si corrige algo, lo guarda enseguida — así la obra
    reportada (y cualquier otra con el mismo problema) se corrige sola en
    cuanto alguien abra la app con esta versión, sin tocar la planilla a
    mano.
  - Probado en un entorno aislado: (a) una obra sembrada con
    `real.materiaPrima` corrompido en negativo, pero con gastos reales
    positivos y correctos, se autocorrige al abrir la app y esa
    corrección queda guardada en el servidor (no solo visible en
    pantalla); (b) un flujo normal — registrar un gasto, consumir stock,
    editar el monto del gasto, eliminar el consumo de stock — deja
    `real.materiaPrima` exactamente igual a la suma vigente en cada paso;
    (c) marcar una orden de compra como comprada suma bien al real de la
    obra, y editarla después para moverla a OTRA obra resta de la vieja y
    suma a la nueva correctamente, actualizando también el pago
    vinculado; (d) los 22 tests de regresión existentes (incluidos los de
    conflictos y el de editar una OC comprada) se volvieron a correr y
    siguen pasando.
- **Fix crítico: dos bugs detrás de que "se pierdan" movimientos —
  reportado puntualmente con un ingreso a un fondo FIMA.** Investigando a
  fondo el reporte se encontraron dos causas distintas, ninguna cubierta
  por los arreglos anteriores de conflictos/auto-refresco:
  - **1) Dos sincronizaciones podían correr al mismo tiempo y pisarse.**
    Tanto reintentar un guardado como el auto-refresco (cada 60s, o al
    volver a la pestaña vía `visibilitychange`/`focus`) traen el estado
    del servidor y lo combinan con lo local, reescribiendo `state` de
    punta a punta — pero nada impedía que dos de estas operaciones
    corrieran superpuestas (ej. un guardado reintentando —por un
    `lock_timeout` del backend, algo que ya sabemos que pasa— justo
    cuando el usuario carga otro movimiento y dispara un segundo
    guardado en paralelo; o `visibilitychange` y `focus` disparando el
    auto-refresco dos veces casi juntos al volver a la pestaña). Cuando
    dos llegaban a cruzarse, había una ventana de milisegundos en la que
    un registro recién cargado quedaba en una copia intermedia que la
    otra sincronización descartaba sin que nada lo volviera a traer — se
    perdía en silencio y nunca llegaba a guardarse. No hacía falta que
    dos personas estuvieran usando la app a la vez, aunque con varios
    dispositivos guardando y sincronizando en simultáneo (como es el caso
    acá) la ventana para que esto pase es bastante más frecuente.
    **Arreglo:** se agregó una cola (`conSyncExclusivo`) — un guardado (con
    sus reintentos) y un auto-refresco ahora se turnan, nunca corren dos
    a la vez.
  - **2) Los movimientos de FIMA eran la única lista de toda la app sin
    `id` propio** — se identificaban por su contenido completo
    (`JSON.stringify`). Esto tenía dos problemas: el orden de campos con
    el que se arma un movimiento nuevo en el navegador no coincidía con
    el orden en que el backend lo devuelve, así que un movimiento ya
    guardado podía duplicarse en la siguiente sincronización; y, más
    grave, si dos movimientos tenían exactamente el mismo contenido (ej.
    dos aportes iguales el mismo día al mismo fondo), borrar o editar
    **uno de los dos** hacía que la próxima sincronización no pudiera
    distinguirlos y terminara perdiendo **los dos**. **Arreglo:** cada
    movimiento de FIMA ahora tiene un `id` propio (como el resto de la
    app) y se combina con el mismo mecanismo robusto (`unionPorId`) que
    ya usan pagos, obras, trabajadores, etc., en vez de compararse por
    contenido. A los movimientos ya cargados sin `id` se les asigna uno
    solo al abrir la app (mismo patrón que ya se usó para los cobros
    importados de Excel). **Requiere redeploy del backend** (columna
    `id` en `MovimientosFima`, ver checklist arriba) para que el `id`
    quede persistido entre recargas — mientras tanto ya corta el
    problema de fondo dentro de cada sesión, que es cuando ocurren la
    gran mayoría de estas sincronizaciones.
  - Probado: (a) simulación directa de la carrera del punto 1 (dos
    refrescos superpuestos con una carga de por medio) — sin la cola el
    ingreso se pierde de forma reproducible; con la cola sobrevive
    siempre; (b) simulación directa de la colisión del punto 2 — dos
    movimientos idénticos, borrar uno con el sistema viejo (contenido)
    borraba los dos; con el sistema nuevo (id) sobrevive exactamente el
    que no se tocó; (c) prueba en un entorno aislado (navegador real):
    alta, edición y borrado de movimientos de FIMA, incluidos dos
    movimientos de contenido idéntico, confirmando ids únicos y que
    `eliminadosLocalmente`/`editadosLocalmente` registran el id
    correcto en cada caso.
- **Nuevo: descargar Pagos y Cobranzas en PDF.** Mismo mecanismo que ya
  existía para las órdenes de compra (`imprimirOrden` — abre una ventana
  con el logo/datos de la empresa y dispara la impresión del navegador,
  para guardar como PDF). Se extrajo ese mecanismo a helpers compartidos
  (`printCss`, `printHeaderHtml`, `abrirVentanaImpresion`) para no
  duplicar el armado de la ventana en cada uno.
  - Pagos → botón "Descargar PDF" que exporta la tabla tal cual está
    filtrada en pantalla (por tipo y categoría), con los mismos datos que
    se ven (destino, concepto, Nº OC, proveedor, monto, saldo, fecha de
    pago, estado) más el total. No aparece en las pestañas de "Ingresos a
    FIMA" ni "Proveedores" (tienen otro formato de tabla).
  - Resultados → botón "Descargar PDF" junto a "Ingresos del mes" que
    exporta los cobros de todas las obras del mes elegido, con el total.
- **Nuevo: sueldos — desglose quincenal y descuento fijo por ausencia.**
  El sueldo se sigue cargando mensual, pero el pago es quincenal (1ª
  quincena por transferencia, 2ª en efectivo) — el historial mensual de
  Jornales ahora muestra el monto de cada quincena por separado, además
  del total. Cada quincena parte de la mitad del sueldo mensual y le
  resta el descuento de las ausencias que cayeron en esa quincena
  puntual (día 1-15 o 16-fin de mes), más las horas extra atribuidas a
  esa quincena (mismo criterio que ya se usaba para el mes: la fecha de
  inicio de la obra). Una quincena nunca queda por debajo de $0 ni le
  pasa el excedente a la otra.
  - Además, el descuento por día ausente pasó a ser un monto fijo
    ($100.000) para cualquier persona, en vez de proporcional al sueldo
    diario de cada quien (que es como funcionaba antes).
  - Esto sigue siendo solo el cálculo/desglose a mostrar — como ya estaba
    documentado, el pago del sueldo no genera gasto ni movimiento de
    FIMA (se gestiona aparte, como costo fijo).
- **Nuevo: decimales en los montos de las órdenes de compra.** Los
  precios unitarios y subtotales de las OC ahora se muestran con 2
  decimales (formulario, listado y PDF) en vez de redondeados al peso —
  útil para materiales con precio con centavos. Se agregó un formato
  aparte (`fmtDec`/`fmtUsdDec`) usado solo en las OC, sin tocar el
  formato del resto de la app (pagos, dashboard, etc.), que sigue
  mostrando montos redondeados como siempre. Internamente los montos
  nunca se truncaban — esto era solo una cuestión de cómo se mostraban.
- **Nuevo: OC con varias obras y reparto de materiales al comprar.** Una
  orden de compra de tipo "Gasto de obra" ahora puede apuntar a más de
  una obra (checkboxes en vez del selector único de antes — si se elige
  una sola, todo funciona exactamente igual que antes). Recién al
  marcarla como "comprada" aparece un selector de obra por cada material
  de la orden (obligatorio elegir una), porque es ahí donde se sabe con
  certeza qué se terminó comprando para cada una.
  - Al confirmar la compra con varias obras elegidas: se genera **un pago
    por obra** (no uno solo), con el monto final repartido
    proporcionalmente según el subtotal de los materiales de cada una
    (mismo criterio de prorrateo que ya usaba la app para las OC de
    stock) — y el costo real de cada obra se recalcula con lo que le
    corresponde.
  - Si después se edita la OC (por ejemplo para corregir el monto final),
    el ajuste se reparte proporcionalmente entre las obras ya asignadas
    — no se vuelve a preguntar qué material va a cuál (a pedido del
    dueño, para no complicar el caso normal de "corregir un monto"). Por
    eso, una vez comprada y repartida entre varias obras, el conjunto de
    obras y la asignación por material quedan fijos — el selector de
    obras aparece bloqueado al editarla, y agregar un material nuevo sin
    obra ya asignada bloquea el guardado (hay que cargar una orden nueva
    para eso). Tampoco se puede convertir una OC ya comprada de una sola
    obra a varias, ni cambiar a cuáles obras apunta una ya repartida —
    en esos casos conviene cargar una orden nueva.
  - El PDF de la orden muestra todas las obras destino, y la tabla de
    materiales suma una columna "Obra" cuando son varias.
  - Al eliminar una obra que es una de varias en una OC repartida, solo
    se desvincula la porción de esa obra puntual (se saca de la lista de
    obras de la OC y se limpia el `obraId` de sus materiales) — el resto
    de la orden y de las otras obras queda intacto, mismo criterio que ya
    existía para una OC de una sola obra.
  - Probado en un entorno aislado (navegador real): crear una OC para dos
    obras con un material para cada una, autorizar, marcar como comprada
    asignando cada material a su obra — se generan los dos pagos con el
    monto exacto de cada material y el costo real de cada obra sube lo
    que corresponde; editar después el precio de un material (subiéndolo)
    y confirmar que el ajuste se reparte proporcionalmente entre los dos
    pagos y los dos costos reales, sin volver a preguntar la asignación;
    confirmar que el selector de obras queda bloqueado al reabrir para
    editar.
  - **Requiere redeploy del backend** (`ordenesCompra.obraIds` y
    `.pagoIds`, ver checklist arriba) — mientras tanto, el reparto en sí
    y los pagos por obra quedan bien calculados y guardados (usan
    columnas que ya existían), pero la lista de a qué obras apunta la OC
    se pierde al recargar la página.
- **Nuevo: Planilla de Pagos por obra.** Recrea la última hoja que se
  usaba en Excel — un resumen imprimible con las compras/pagos pendientes
  de gestionar para esa obra en particular, para pasárselo a otra persona
  del equipo. Se arma sola con los datos ya cargados de la obra (no se
  carga nada a mano) y aparece como la última sección del detalle de cada
  obra, con un botón "Descargar PDF" (mismo mecanismo que ya usan
  OC/Pagos/Cobranzas).
  - **Impuestos:** IVA de la obra (débito de sus cobros menos crédito de
    sus gastos con IVA — mismo criterio que el Reporte de IVA general,
    pero acumulado de toda la obra en vez de por mes) e IIBB (sobre lo
    cobrado sin IVA, a la tasa de IIBB que se eligió en el presupuesto de
    esa obra puntual — no una tasa fija, para no pagar de más o de menos
    si alguna obra quedó con otra provincia).
  - **Materiales a reponer:** el stock que se consumió para esta obra
    (no lo que ya se compró directo para la obra — eso se paga por el
    circuito normal de Pagos/OC), con cantidad y costo por material.
  - **Combustible:** mismo cálculo que ya se veía en la card
    "Combustible" de la obra.
  - **Comisiones:** comisión del vendedor + el reparto de la ganancia
    neta entre los dos socios configurados en el presupuesto y AQ (la
    empresa, se queda con el resto) — se sacó ese cálculo a una función
    compartida (`obraDistribucionGanancia`) para no tener la fórmula
    duplicada con la que ya usaba "Presupuestado vs. real".
  - **Total pagos / Cobrado / Diferencia:** el total es la suma de lo de
    arriba (no de todos los costos de la obra, es específicamente lo que
    hay que gestionar aparte), y la diferencia contra lo cobrado es la
    plata que queda para ayudar a pagar los jornales.
  - Incluye las mismas notas fijas de la planilla vieja (poner el IVA en
    FIMA para pagar a 60 días, consultar Ingresos Brutos, conseguir el
    mejor precio, transferir a Edenred, que la ganancia de AQ va al fondo
    FIMA, que la diferencia se usa para los jornales).
  - Probado en un entorno aislado con una obra con cobros, un gasto con
    IVA, un gasto de combustible y stock consumido: los montos de IVA,
    IIBB, materiales a reponer, combustible y el reparto de comisiones
    coinciden exactamente con el cálculo esperado a mano; la sección
    aparece al final del detalle de la obra (después de "Presupuestado
    vs. real — detalle") y el PDF se genera sin errores.
- **Fix importante: cargar la fecha de pago al registrar un gasto no lo
  dejaba "Programado" — se quedaba "Pendiente" para siempre.** Había dos
  caminos para poner una fecha de pago a un gasto, que a simple vista se
  ven iguales pero hacían cosas distintas: "Registrar pago →" (sobre un
  gasto ya cargado) sí generaba un compromiso real que madura solo
  cuando llega la fecha (`reconciliarPagosProgramados`, corre al abrir
  la app); pero cargar la fecha y el medio de pago directo al crear el
  gasto — en "Registrar compra/gasto", "Registrar compra de stock" o al
  "Marcar como comprada" una orden de compra — solo dejaba esos datos
  anotados como referencia, sin crear ningún compromiso. El gasto
  quedaba "Pendiente" (nunca "Programado") y no se marcaba solo como
  pagado al llegar la fecha — alguien tenía que acordarse de entrar y
  tocar "Registrar pago →" a mano más adelante.
  - **Arreglo:** los tres lugares de carga ahora usan el mismo mecanismo
    que ya tenía "Registrar pago →" (`aplicarCompromisoDePago`): si la
    fecha cargada ya llegó, se aplica al toque (sale la plata ya); si es
    futura, queda "Programado" y madura solo. También se sumó un
    selector de "Fondo que paga" en esos tres formularios (antes solo
    estaba en "Registrar pago →") para cuando el medio elegido es FIMA.
    Quedan así los 3 estados esperados sin importar por cuál de los
    cuatro caminos se cargó: sin fecha → Pendiente, con fecha futura →
    Programado, fecha ya llegada → Pagado. Editar la fecha de un gasto
    todavía sin pagar (Pendiente o Programado) también actualiza el
    compromiso — antes, editar la fecha de un "Programado" no tocaba el
    compromiso ya creado y maduraba solo con la fecha vieja.
  - **Bug relacionado, encontrado en el camino:** si un gasto "Programado"
    se terminaba pagando antes de la fecha prevista (por "Registrar pago
    →"), el compromiso viejo sin aplicar quedaba pegado en el registro —
    y cuando llegaba esa fecha vieja, `reconciliarPagosProgramados` lo
    volvía a aplicar, **descontando la plata dos veces**. Ahora, tanto
    `aplicarCompromisoDePago` como `submitFinalizarPago` sacan cualquier
    compromiso previo todavía sin aplicar antes de cargar el nuevo — sin
    tocar nunca lo que ya se pagó de verdad.
  - **Límite conocido:** no soporta programar el mismo gasto en dos
    fechas futuras distintas a la vez (ej. mitad con cheque a 30 días y
    mitad a 60) — el segundo compromiso reemplaza al primero en vez de
    sumarse. Es un caso raro y ya era poco claro antes de este arreglo;
    si hace falta avisá para verlo aparte.
  - **Cuidado con los datos ya cargados antes de este arreglo:** un gasto
    viejo con una fecha de pago ya pasada y sin nada pagado de verdad
    (el patrón atascado que motivó este arreglo) **no se toca solo** al
    desplegar esto — nada corre retroactivamente sobre lo ya cargado.
    Sigue viéndose "Pendiente" igual que antes hasta que alguien lo
    edite. Y ahí se puso especial cuidado: si se edita ese gasto viejo
    por otro motivo (por ejemplo corregir el detalle) sin tocar la fecha
    ni el medio de pago, el guardado NO arma el compromiso ni descuenta
    plata — solo se arma/actualiza el compromiso cuando la edición
    realmente cambia la fecha o el medio (una decisión deliberada), o
    cuando ya había un compromiso "Programado" (creado con este mismo
    arreglo) y se le edita el monto. Sin este cuidado, guardar cualquier
    cambio menor en un gasto viejo con fecha pasada habría descontado la
    plata de golpe como efecto secundario, sin que nadie lo pidiera.
  - Probado en un entorno aislado: cargar un gasto con fecha futura
    (queda Programado, no descuenta caja) y con fecha de hoy (queda
    Pagado, descuenta caja al toque); editar la fecha de uno Programado
    a otra fecha futura (un solo compromiso, con la fecha nueva, no
    duplica); pagar uno Programado antes de tiempo por "Registrar pago
    →" (reemplaza el compromiso viejo, descuenta una sola vez, y
    `reconciliarPagosProgramados` corrido después no vuelve a
    descontar); "Registrar compra de stock" con fecha futura (mismo
    comportamiento); "Marcar como comprada" una orden con medio FIMA y
    fecha futura (aparece el selector de fondo, queda Programado sin
    descontar el fondo todavía); un gasto viejo simulado con fecha
    pasada y sin pago real: editar solo el detalle no activa nada (sigue
    Pendiente, caja sin cambios), pero cambiar deliberadamente la fecha
    sí lo aplica; editar solo el monto de un gasto ya Programado
    actualiza el compromiso pendiente al monto nuevo.
- **Nuevo: obra sin presupuesto (total $0) — se inicia y se gestiona
  igual, pero sin comparaciones que no tienen sentido.** Una obra que se
  inicia directamente sin pasar por el armador de presupuesto (o que se
  armó dejando todo en $0 a propósito) se identifica automáticamente
  (`obraSinPresupuesto()` — suma de materiales+mano de obra+logística+
  estadía presupuestados = $0) y en toda la app se le deja de comparar
  el costo real contra un presupuesto que no existe:
  - **Tabla de Obras y Dashboard:** en vez de la barra de "Desvío
    costos" (que antes mostraba un % sin sentido, como si todo gasto
    estuviera "100% por encima" de un presupuesto de $0), muestra "Sin
    presupuesto — $X gastado".
  - **Costos por categoría** (en el detalle de la obra): cada card
    muestra el costo real solo, sin barra de %.
  - **"Presupuesto → Facturación"**: se oculta entero (no hay nada que
    mostrar ahí).
  - **Card de "Ingresos"**: en vez del "X% cobrado" (que con presupuesto
    $0 siempre daría "0% cobrado" aunque hubiera cobros reales
    cargados), muestra directo "Cobrado: $X".
  - **"Presupuestado vs. real — detalle"**: cada fila muestra "--" en
    Presupuestado y en Diferencia, y el valor real en la columna Real
    — incluidas las filas de comisión vendedor, ganancia neta y el
    reparto de socios/AQ (que siguen calculándose con la plata real,
    solo que ya no hay un valor presupuestado contra el cual compararlas).
  - **KPI "obras por encima del presupuesto"** (Dashboard): deja afuera
    del conteo a las obras sin presupuesto — antes las contaba a todas
    como "por encima" apenas tuvieran algún gasto real cargado.
  - **"Editar presupuesto"** sigue apareciendo siempre, sin cambios —
    para si en algún momento se quiere cargar uno (aunque sea solo para
    fijar la comisión del vendedor o el reparto de socios, sin
    necesariamente presupuestar costos).
  - Probado en un entorno aislado: una obra sembrada con presupuesto en
    $0 pero con cobros y gastos reales cargados muestra "Sin
    presupuesto" en Dashboard y en la lista de Obras, no muestra la
    card "Presupuesto → Facturación", muestra "Sin presupuesto" en las
    cards de costos por categoría, "--" en la tabla de presupuestado
    vs. real, "Cobrado: $X" en Ingresos, y el botón "Editar presupuesto"
    sigue presente; una obra con presupuesto normal, probada en paralelo,
    sigue mostrando todo exactamente igual que antes (sin "Sin
    presupuesto" en ningún lado, con sus % de desvío normales).
- **Nuevo: orden de la tabla de Obras y card de obras excedidas en
  Resultados.**
  - La tabla de Obras ahora ordena por fecha de inicio (de más antigua a
    más nueva) y deja las obras en estado "finalizada" todas al final
    (también ordenadas por fecha entre ellas) — para que no se vayan
    acumulando arriba y tapando las obras activas.
  - Resultados suma una card "Obras excedidas este mes": cuenta las
    obras que tuvieron algún gasto pagado ese mes puntual y que, mirando
    su costo real acumulado hasta hoy, están por encima de su
    presupuesto total (las obras sin presupuesto quedan afuera del
    conteo, coherente con el cambio anterior) — la nota de la card lista
    los códigos de esas obras.
  - Probado en un entorno aislado: 4 obras con distintas fechas y
    estados confirman el orden esperado (activas por fecha, finalizadas
    al final); una obra con un gasto cargado en el mes seleccionado que
    supera su presupuesto aparece contada y nombrada en la card nueva,
    mientras que una obra con gasto ese mes pero dentro de presupuesto
    no se cuenta.
- **Nuevo: Planilla de Pagos — sección de pagos pendientes/programados.**
  Hasta ahora la Planilla de Pagos de cada obra (`obraPlanillaPagos`) solo
  sumaba Impuestos, Materiales a reponer (solo stock consumido, no lo
  comprado directo para la obra), Combustible y Comisiones — los gastos
  "normales" de la obra (materiales, mano de obra, logística, etc.)
  todavía sin pagar no aparecían en ningún lado de la planilla, así que
  el equipo no veía ahí cuánto había que separar para esas compras ya
  comprometidas.
  - Se agregó una sección "Pagos pendientes / programados" (card y PDF)
    que lista cada gasto de la obra (`tipo:'obra'`) cuyo estado sea
    Pendiente o Programado — concepto, categoría, proveedor, monto,
    fecha de pago y estado — con su subtotal.
  - Ese subtotal ahora se suma al "Total pagos" (y resta de la
    "Diferencia" para jornales), porque es plata que el equipo va a
    tener que pagar sí o sí.
  - Deja afuera lo ya Pagado/Parcial (ya salió, o ya cuenta como costo
    real) y las órdenes de compra todavía no marcadas "comprada" (esas
    no generaron un pago con monto/fecha firme todavía).
  - Probado en un entorno aislado: una obra con 6 gastos sembrados (uno
    pagado, uno sin fecha, uno con fecha pasada sin compromiso aplicado,
    uno programado a futuro, uno parcial y uno de stock con `obraId`
    nulo) — la sección solo lista los 3 que corresponden (sin fecha,
    fecha pasada y programado), con el subtotal correcto, tanto en la
    card como en el PDF; los demás no aparecen.
