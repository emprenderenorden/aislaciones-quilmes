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
