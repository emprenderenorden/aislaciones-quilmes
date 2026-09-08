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

Estos cambios de esquema ya están en `backend-AppsScript.gs` (en `main`) pero
**todavía no están desplegados** en el Apps Script real. Hasta que se haga el
redeploy, los campos nuevos no se guardan en el Sheet (se pierden al recargar):

- [ ] `trabajadores`: campo `sueldoMensual`.
- [ ] `obras`: campo `jornalesConfigJSON` (asignación de trabajadores +
      horas extra por obra).
- [ ] `stock`: campos `categoria` y `stockMinimo` (ver más abajo).
- [ ] `obras`: campo `comisionOverrideJSON` (comisión del vendedor editable
      puntualmente en la obra, ver más abajo).
- [ ] `movimientosFima`: campo `subcategoria` (ver más abajo).

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
