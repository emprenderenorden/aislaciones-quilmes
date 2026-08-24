/**
 * Aislaciones Quilmes — backend de Google Apps Script
 *
 * Qué hace:
 *  - Guarda y lee todo el estado de la app (obras, pagos, órdenes de
 *    compra, proveedores, stock, jornales, FIMA, datos de la empresa)
 *    en las hojas de este Google Sheet.
 *  - Recibe archivos sueltos (facturas, remitos, OC firmadas) desde la
 *    app y los sube a la carpeta de Drive del negocio.
 *
 * CÓMO INSTALARLO (una sola vez):
 *  1. Abrí el Google Sheet "Aislaciones Quilmes — Base de Datos".
 *  2. Extensiones → Apps Script.
 *  3. Borrá el contenido de Code.gs que aparece por defecto y pegá
 *     TODO este archivo en su lugar.
 *  4. Reemplazá la constante SECRET de más abajo por una clave propia
 *     (cualquier texto largo que solo ustedes conozcan).
 *  5. Guardá (ícono de disquete).
 *  6. Ejecutá una vez la función `setup` desde el menú de arriba
 *     (seleccioná "setup" en el desplegable de funciones y tocá ▶).
 *     La primera vez te va a pedir autorización — es tu propia cuenta,
 *     aceptá los permisos.
 *  7. Implementar → Nueva implementación → tipo "Aplicación web".
 *     - Ejecutar como: Yo (tu cuenta)
 *     - Quién tiene acceso: Cualquier usuario
 *     Desplegar, y copiá la URL que te da (termina en /exec).
 *  8. Esa URL y el SECRET son los dos datos que hay que pegar en
 *     index.html (state-api-config.js) para conectar la app.
 */

// ⚠️ Cambiá esto por una clave propia antes de desplegar.
const SECRET = 'CAMBIAR-ESTA-CLAVE-POR-UNA-PROPIA';

// ID de la carpeta de Drive donde se suben los archivos sueltos de las obras.
const CARPETA_DOCUMENTOS_ID = '1ufrXSSoEzAitD_t3Z4Qa7tScXEdpBtux';

const SHEET_NAMES = {
  config: 'Config',
  fondos: 'Fondos',
  obras: 'Obras',
  pagos: 'Pagos',
  ordenesCompra: 'OrdenesCompra',
  proveedores: 'Proveedores',
  stock: 'Stock',
  stockMovimientos: 'StockMovimientos',
  trabajadores: 'Trabajadores',
  jornales: 'Jornales',
  movimientosFima: 'MovimientosFima',
  datosEmpresa: 'DatosEmpresa',
};

const SCHEMAS = {
  config: ['caja'],
  fondos: ['fondo', 'monto'],
  obras: ['id', 'code', 'cliente', 'encargado', 'fechaInicio', 'estado',
    'presupuestoJSON', 'presupuestoDetalleJSON', 'presupuestoResumenJSON',
    'realJSON', 'ingresosJSON', 'ingresosListJSON', 'facturasVentaJSON', 'documentosJSON'],
  pagos: ['id', 'tipo', 'obraId', 'categoria', 'concepto', 'cantidad', 'unitario',
    'ivaAplica', 'monto', 'proveedorId', 'numeroFactura', 'fechaFactura', 'formaPago',
    'fechaPago', 'numeroOC', 'origenFondo', 'pagosRealizadosJSON'],
  ordenesCompra: ['id', 'numero', 'fecha', 'solicitante', 'tipo', 'obraId', 'categoria',
    'itemsJSON', 'monto', 'proveedorId', 'estado', 'comentarioDueno', 'pagoId',
    'cotizacionUsd', 'notaMaterial', 'notaGeneral'],
  proveedores: ['id', 'nombre', 'cuit', 'telefono', 'email'],
  stock: ['id', 'nombre', 'unidad', 'cantidad', 'costoUnitario'],
  stockMovimientos: ['id', 'fecha', 'tipo', 'stockId', 'cantidad', 'obraId', 'monto'],
  trabajadores: ['id', 'nombre', 'puesto'],
  jornales: ['id', 'trabajadorId', 'obraId', 'semanaInicio', 'diasJSON'],
  movimientosFima: ['fecha', 'fondo', 'obraId', 'concepto', 'tipo', 'monto'],
  datosEmpresa: ['nombre', 'cuit', 'telefono', 'email', 'direccion', 'localidad',
    'condicionImpositiva', 'condicionesGenerales', 'logoDataUrl'],
};

function getSs_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Corré esto una sola vez desde el editor para crear todas las hojas con sus columnas. */
function setup() {
  const ss = getSs_();
  Object.keys(SHEET_NAMES).forEach(key => {
    getOrCreateSheet_(ss, SHEET_NAMES[key], SCHEMAS[key]);
  });
  const defaultSheet = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  SpreadsheetApp.getUi().alert('Listo — se crearon todas las hojas.');
}

function sheetToRows_(sh, headers) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function parseJsonField_(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

function toBool_(v) { return v === true || v === 'true' || v === 'TRUE'; }
function toNumOrNull_(v) { return (v === '' || v === null || v === undefined) ? null : Number(v); }
function toStrOrNull_(v) { return (v === '' || v === null || v === undefined) ? null : String(v); }

/** Convierte todas las hojas al mismo objeto `state` que usa la app. */
function readState_() {
  const ss = getSs_();
  Object.keys(SHEET_NAMES).forEach(key => getOrCreateSheet_(ss, SHEET_NAMES[key], SCHEMAS[key]));

  const configRows = sheetToRows_(ss.getSheetByName(SHEET_NAMES.config), SCHEMAS.config);
  const caja = configRows.length ? Number(configRows[0].caja) || 0 : 0;

  const fondos = {};
  sheetToRows_(ss.getSheetByName(SHEET_NAMES.fondos), SCHEMAS.fondos).forEach(r => {
    fondos[r.fondo] = Number(r.monto) || 0;
  });

  const obras = sheetToRows_(ss.getSheetByName(SHEET_NAMES.obras), SCHEMAS.obras).map(r => ({
    id: r.id, code: r.code, cliente: r.cliente, encargado: r.encargado,
    fechaInicio: r.fechaInicio, estado: r.estado,
    presupuesto: parseJsonField_(r.presupuestoJSON, { materiaPrima: 0, manoObra: 0, logistica: 0, estadia: 0 }),
    presupuestoDetalle: parseJsonField_(r.presupuestoDetalleJSON, null),
    presupuestoResumen: parseJsonField_(r.presupuestoResumenJSON, {}),
    real: parseJsonField_(r.realJSON, { materiaPrima: 0, manoObra: 0, logistica: 0, estadia: 0, otros: 0 }),
    ingresos: parseJsonField_(r.ingresosJSON, { facturado: 0, cobrado: 0 }),
    ingresosList: parseJsonField_(r.ingresosListJSON, []),
    facturasVenta: parseJsonField_(r.facturasVentaJSON, []),
    documentos: parseJsonField_(r.documentosJSON, []),
  }));

  const pagos = sheetToRows_(ss.getSheetByName(SHEET_NAMES.pagos), SCHEMAS.pagos).map(r => ({
    id: r.id, tipo: r.tipo, obraId: toStrOrNull_(r.obraId), categoria: toStrOrNull_(r.categoria),
    concepto: r.concepto, cantidad: Number(r.cantidad) || 0, unitario: Number(r.unitario) || 0,
    ivaAplica: toBool_(r.ivaAplica), monto: Number(r.monto) || 0,
    proveedorId: toStrOrNull_(r.proveedorId), numeroFactura: toStrOrNull_(r.numeroFactura),
    fechaFactura: toStrOrNull_(r.fechaFactura), formaPago: r.formaPago,
    fechaPago: toStrOrNull_(r.fechaPago), numeroOC: toStrOrNull_(r.numeroOC),
    origenFondo: toStrOrNull_(r.origenFondo),
    pagosRealizados: parseJsonField_(r.pagosRealizadosJSON, []),
  }));

  const ordenesCompra = sheetToRows_(ss.getSheetByName(SHEET_NAMES.ordenesCompra), SCHEMAS.ordenesCompra).map(r => ({
    id: r.id, numero: r.numero, fecha: r.fecha, solicitante: r.solicitante, tipo: r.tipo,
    obraId: toStrOrNull_(r.obraId), categoria: toStrOrNull_(r.categoria),
    items: parseJsonField_(r.itemsJSON, []), monto: Number(r.monto) || 0,
    proveedorId: toStrOrNull_(r.proveedorId), estado: r.estado,
    comentarioDueno: toStrOrNull_(r.comentarioDueno), pagoId: toStrOrNull_(r.pagoId),
    cotizacionUsd: toNumOrNull_(r.cotizacionUsd), notaMaterial: r.notaMaterial || '',
    notaGeneral: r.notaGeneral || '',
  }));

  const proveedores = sheetToRows_(ss.getSheetByName(SHEET_NAMES.proveedores), SCHEMAS.proveedores);
  const stock = sheetToRows_(ss.getSheetByName(SHEET_NAMES.stock), SCHEMAS.stock).map(r => ({
    id: r.id, nombre: r.nombre, unidad: r.unidad, cantidad: Number(r.cantidad) || 0,
    costoUnitario: Number(r.costoUnitario) || 0,
  }));
  const stockMovimientos = sheetToRows_(ss.getSheetByName(SHEET_NAMES.stockMovimientos), SCHEMAS.stockMovimientos).map(r => ({
    id: r.id, fecha: r.fecha, tipo: r.tipo, stockId: r.stockId,
    cantidad: Number(r.cantidad) || 0, obraId: toStrOrNull_(r.obraId), monto: Number(r.monto) || 0,
  }));
  const trabajadores = sheetToRows_(ss.getSheetByName(SHEET_NAMES.trabajadores), SCHEMAS.trabajadores);
  const jornales = sheetToRows_(ss.getSheetByName(SHEET_NAMES.jornales), SCHEMAS.jornales).map(r => ({
    id: r.id, trabajadorId: r.trabajadorId, obraId: toStrOrNull_(r.obraId),
    semanaInicio: r.semanaInicio, dias: parseJsonField_(r.diasJSON, Array(7).fill('sin_obra')),
  }));
  const movimientosFima = sheetToRows_(ss.getSheetByName(SHEET_NAMES.movimientosFima), SCHEMAS.movimientosFima).map(r => ({
    fecha: r.fecha, fondo: r.fondo, obraId: toStrOrNull_(r.obraId), concepto: r.concepto,
    tipo: r.tipo, monto: Number(r.monto) || 0,
  }));

  const empresaRows = sheetToRows_(ss.getSheetByName(SHEET_NAMES.datosEmpresa), SCHEMAS.datosEmpresa);
  const datosEmpresa = empresaRows.length ? empresaRows[0] : {};

  return { caja, fondos, obras, pagos, ordenesCompra, proveedores, stock, stockMovimientos,
    trabajadores, jornales, movimientosFima, datosEmpresa };
}

function writeRows_(sh, headers, rows, rowToArray) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!rows.length) return;
  const values = rows.map(rowToArray);
  sh.getRange(2, 1, values.length, headers.length).setValues(values);
}

/** Recibe el `state` completo (como lo tiene la app) y reescribe todas las hojas. */
function writeState_(state) {
  const ss = getSs_();
  Object.keys(SHEET_NAMES).forEach(key => getOrCreateSheet_(ss, SHEET_NAMES[key], SCHEMAS[key]));

  writeRows_(ss.getSheetByName(SHEET_NAMES.config), SCHEMAS.config,
    [{ caja: state.caja || 0 }], r => [r.caja]);

  const fondosRows = Object.keys(state.fondos || {}).map(k => ({ fondo: k, monto: state.fondos[k] }));
  writeRows_(ss.getSheetByName(SHEET_NAMES.fondos), SCHEMAS.fondos, fondosRows, r => [r.fondo, r.monto]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.obras), SCHEMAS.obras, state.obras || [], o => [
    o.id, o.code, o.cliente, o.encargado, o.fechaInicio, o.estado,
    JSON.stringify(o.presupuesto || {}), JSON.stringify(o.presupuestoDetalle || null),
    JSON.stringify(o.presupuestoResumen || {}), JSON.stringify(o.real || {}),
    JSON.stringify(o.ingresos || {}), JSON.stringify(o.ingresosList || []),
    JSON.stringify(o.facturasVenta || []), JSON.stringify(o.documentos || []),
  ]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.pagos), SCHEMAS.pagos, state.pagos || [], p => [
    p.id, p.tipo, p.obraId, p.categoria, p.concepto, p.cantidad, p.unitario, p.ivaAplica,
    p.monto, p.proveedorId, p.numeroFactura, p.fechaFactura, p.formaPago, p.fechaPago,
    p.numeroOC || '', p.origenFondo || '', JSON.stringify(p.pagosRealizados || []),
  ]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.ordenesCompra), SCHEMAS.ordenesCompra, state.ordenesCompra || [], o => [
    o.id, o.numero, o.fecha, o.solicitante, o.tipo, o.obraId, o.categoria,
    JSON.stringify(o.items || []), o.monto, o.proveedorId, o.estado, o.comentarioDueno,
    o.pagoId, o.cotizacionUsd, o.notaMaterial || '', o.notaGeneral || '',
  ]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.proveedores), SCHEMAS.proveedores, state.proveedores || [],
    p => [p.id, p.nombre, p.cuit || '', p.telefono || '', p.email || '']);

  writeRows_(ss.getSheetByName(SHEET_NAMES.stock), SCHEMAS.stock, state.stock || [],
    s => [s.id, s.nombre, s.unidad, s.cantidad, s.costoUnitario]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.stockMovimientos), SCHEMAS.stockMovimientos, state.stockMovimientos || [],
    m => [m.id, m.fecha, m.tipo, m.stockId, m.cantidad, m.obraId, m.monto]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.trabajadores), SCHEMAS.trabajadores, state.trabajadores || [],
    t => [t.id, t.nombre, t.puesto]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.jornales), SCHEMAS.jornales, state.jornales || [],
    j => [j.id, j.trabajadorId, j.obraId, j.semanaInicio, JSON.stringify(j.dias || [])]);

  writeRows_(ss.getSheetByName(SHEET_NAMES.movimientosFima), SCHEMAS.movimientosFima, state.movimientosFima || [],
    m => [m.fecha, m.fondo, m.obraId, m.concepto, m.tipo, m.monto]);

  const e = state.datosEmpresa || {};
  writeRows_(ss.getSheetByName(SHEET_NAMES.datosEmpresa), SCHEMAS.datosEmpresa, [e], e => [
    e.nombre || '', e.cuit || '', e.telefono || '', e.email || '', e.direccion || '',
    e.localidad || '', e.condicionImpositiva || '', e.condicionesGenerales || '', e.logoDataUrl || '',
  ]);
}

function checkAuth_(secret) {
  return secret === SECRET;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const secret = e.parameter.secret;
  if (!checkAuth_(secret)) return jsonOut_({ error: 'unauthorized' });
  try {
    return jsonOut_({ ok: true, state: readState_() });
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ error: 'bad_json' });
  }
  if (!checkAuth_(body.secret)) return jsonOut_({ error: 'unauthorized' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === 'uploadFile') {
      const folder = DriveApp.getFolderById(CARPETA_DOCUMENTOS_ID);
      const bytes = Utilities.base64Decode(body.fileBase64);
      const blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.fileName || 'archivo');
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonOut_({ ok: true, url: file.getUrl(), fileId: file.getId() });
    }
    // Guardado normal: reescribe todo el estado.
    writeState_(body.state);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
