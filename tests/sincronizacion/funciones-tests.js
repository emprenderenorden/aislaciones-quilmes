// Pruebas de las funciones de costos fijos, adelantos/detalle de sueldo,
// firmas + orden de pago y buscador al tipear — mismo esquema que
// sync-tests.js (app real en Chromium contra el backend-AppsScript.gs real
// sobre un Sheet simulado). Ver README.md para preparar nuevo.html/viejo.html.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const {spawn}=require('child_process');
const dump=()=>fetch('http://127.0.0.1:8770/dump').then(r=>r.json()).then(d=>d.state);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(cond,msg)=>{console.log((cond?'  ✔ ':'  ✘ ')+msg); if(!cond) fails++;};
async function withServer(fn){
  const srv=spawn('node',[__dirname+'/gas-server.js',__dirname+'/seed.json'],{env:{...process.env,PORT:'8770'}});
  await new Promise(r=>srv.stdout.once('data',r));
  try{ await fn(); } finally { srv.kill(); await sleep(200); }
}
async function tab(b, file){
  const p=await b.newPage({viewport:{width:1366,height:900}}); p.on('dialog',d=>d.accept()); p.on('pageerror',e=>{console.log('   PAGEERROR',e.message); fails++;});
  await p.goto('file://'+__dirname+'/'+file);
  await p.waitForFunction(()=>typeof bootCompleto!=='undefined'&&bootCompleto);
  await p.waitForTimeout(300);
  // Captura lo que se manda a imprimir en vez de abrir otra ventana.
  await p.evaluate(()=>{ window.open=()=>({document:{write(h){ window.__impreso=h; }, close(){}}}); });
  return p;
}
const esperarGuardado=async p=>{ await p.waitForTimeout(1200); await p.waitForFunction(()=>!hayGuardadoPendiente,null,{timeout:15000}); await p.waitForTimeout(200); };
const mesActual=new Date().toISOString().slice(0,7);
(async()=>{
  const b=await chromium.launch();

  console.log('F1 — costos fijos: concepto, pago desde la grilla y persistencia');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ showView('pagos'); setPagosFilter('fijo'); });
    await A.click('text=+ Agregar costo fijo');
    await A.fill('#f-cf-nombre','Internet'); await A.selectOption('#f-cf-cat','servicios'); await A.fill('#f-cf-monto','42501'); await A.selectOption('#f-cf-forma','Transferencia'); await A.fill('#f-cf-dia','1');
    await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.isVisible('.cf-grid >> text=Internet'), 'la fila "Internet" aparece en la grilla');
    const cajaAntes=await A.evaluate(()=>state.caja);
    const cfId=await A.evaluate(()=>state.costosFijos[0].id);
    await A.evaluate(([id,m])=>openModalCeldaCostoFijo('c|'+id, m), [cfId, mesActual]);
    await A.fill('#f-fechapago', new Date().toISOString().slice(0,10));
    await A.click('#modal-content .modal-actions button.btn-primary');
    const celda=await A.textContent(`.cf-grid tr:has-text("Internet") td:nth-child(2)`);
    ok(/42\.501,00/.test(celda) && /pagado/.test(celda), 'la celda del mes muestra el monto con ✓ pagado ('+celda.trim()+')');
    ok(await A.evaluate(c=>state.caja===c-42501, cajaAntes), 'el pago descontó la caja (igual que cualquier gasto fijo)');
    // Un gasto fijo viejo sin concepto, con el mismo nombre, cae en la misma fila
    await A.evaluate(m=>{ state.pagos.push({id:'pgv',tipo:'fijo',obraId:null,categoria:'servicios',concepto:'internet ',cantidad:1,unitario:10,ivaAplica:false,monto:10,proveedorId:null,numeroFactura:null,fechaFactura:m+'-01',formaPago:'A definir',fechaPago:null,numeroOC:null,origenFondo:null,pagosRealizados:[]}); renderAll(); }, mesActual);
    const celda2=await A.textContent(`.cf-grid tr:has-text("Internet") td:nth-child(2)`);
    ok(/42\.511,00/.test(celda2) && /\(2\)/.test(celda2), 'un gasto fijo cargado antes con el mismo nombre se suma a esa fila ('+celda2.trim()+')');
    ok(await A.isVisible('.cf-grid >> text=Gasto X') === false, 'un gasto fijo sin concepto de otro mes no agrega filas a este trimestre');
    await esperarGuardado(A);
    const s=await dump();
    ok(s.costosFijos.length===1 && s.costosFijos[0].nombre==='Internet' && s.costosFijos[0].montoMensual===42501, 'el concepto quedó guardado en la planilla');
    const pg=s.pagos.find(p=>p.costoFijoId===cfId);
    ok(pg && pg.periodo===mesActual, 'el pago quedó atado al concepto y al mes (vinculoJSON)');
    const B=await tab(b,'nuevo.html');
    await B.evaluate(()=>{ showView('pagos'); setPagosFilter('fijo'); });
    ok(/42\.511,00/.test(await B.textContent(`.cf-grid tr:has-text("Internet") td:nth-child(2)`)), 'otra pestaña recién abierta ve la grilla igual');
    // Eliminar el concepto no borra los pagos
    await B.evaluate(id=>{ openModalConceptoCostoFijo(id); }, cfId); await B.click('#modal-content .modal-actions >> text=Eliminar');
    await esperarGuardado(B);
    const s2=await dump();
    ok(s2.costosFijos.length===0 && s2.pagos.some(p=>p.costoFijoId===cfId), 'eliminar el concepto lo saca de la grilla pero el pago sigue en Pagos');
    await A.close(); await B.close();
  });

  console.log('F2 — jornales por quincena (generan el gasto al registrarlas) + adelanto + detalle de sueldo');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ getTrabajador('t1').sueldoMensual=1000000; renderAll(); });
    // un día ausente en la 1ª quincena de este mes
    await A.evaluate(m=>{ const lunes=mondayOf(m+'-05'); const idx=(new Date(m+'-05T00:00:00').getDay()+6)%7; const dias=Array(7).fill(0).map(()=>({estado:'sin_obra',obraId:null})); dias[idx]={estado:'ausente',obraId:null}; state.jornales.push({id:'jx',trabajadorId:'t1',semanaInicio:lunes,dias}); renderAll(); }, mesActual);
    const q1Antes=await A.evaluate(m=>desgloseQuincena(getTrabajador('t1'),m,1).total, mesActual);
    ok(q1Antes===400000, '1ª quincena: 500.000 − 1 ausencia (100.000) = 400.000 ('+q1Antes+')');
    const cajaAntes=await A.evaluate(()=>state.caja);
    await A.evaluate(m=>openModalAdelanto('t1', m), mesActual);
    await A.fill('#f-adel-monto','50000'); await A.selectOption('#f-adel-q','1');
    await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(c=>state.caja===c-50000, cajaAntes), 'el adelanto descontó la caja');
    ok(await A.evaluate(m=>desgloseQuincena(getTrabajador('t1'),m,1).total, mesActual)===350000, 'y se descuenta de la 1ª quincena (350.000)');
    await A.evaluate(()=>{ showView('jornales'); });
    const filaHist=await A.textContent('#jornales-historial-body tr:has-text("Ana")');
    ok(/− \$ 50\.000,00/.test(filaHist), 'el historial muestra la columna Adelantos');
    await A.evaluate(m=>openModalDetalleSueldo('t1', m), mesActual);
    const det=await A.textContent('#modal-content');
    ok(/Días ausentes \(1\)/.test(det) && /Total 1ª quincena/.test(det) && /Total del mes/.test(det) && /Adelanto del/.test(det), 'el detalle muestra ausentes, adelanto, total por quincena y total del mes');
    await A.click('#modal-content .modal-actions button.btn-primary');
    const impreso=await A.evaluate(()=>window.__impreso||'');
    ok(/DETALLE DE SUELDO/.test(impreso) && /350\.000,00/.test(impreso), 'el PDF del detalle se genera con los totales');
    await A.evaluate(()=>closeModal());
    // fila automática en costos fijos
    await A.evaluate(()=>{ showView('pagos'); setPagosFilter('fijo'); });
    const filaQ1=await A.textContent('.cf-grid tr:has-text("1ª quincena") td:nth-child(2)');
    ok(/350\.000,00/.test(filaQ1) && /calculado/.test(filaQ1), 'la fila "Jornales — 1ª quincena" muestra el cálculo automático ('+filaQ1.trim()+')');
    ok(await A.isVisible('.cf-grid >> text=Adelantos de sueldo'), 'aparece la fila de adelantos de sueldo');
    const hoy=new Date().toISOString().slice(0,10);
    const caja2=await A.evaluate(()=>state.caja);
    const egresosAntes=await A.evaluate(m=>computeMesResultado(m).totalEgresos, mesActual);
    await A.evaluate(m=>openModalPagoQuincena(m,1), mesActual);
    await A.fill('#f-pq-monto','360000'); await A.fill('#f-pq-fecha', hoy); await A.selectOption('#f-forma','Efectivo');
    await A.click('#modal-content .modal-actions button.btn-primary');
    const filaQ1b=await A.textContent('.cf-grid tr:has-text("1ª quincena") td:nth-child(2)');
    ok(/360\.000,00/.test(filaQ1b) && /pagado/.test(filaQ1b), 'registrar la quincena (monto editado, fecha de hoy) la marca ✓ pagado');
    ok(await A.evaluate(c=>state.caja===c-360000, caja2), 'y genera el gasto: descuenta la caja');
    ok(await A.evaluate(([m,e])=>computeMesResultado(m).totalEgresos===e+360000, [mesActual, egresosAntes]), 'y entra en los egresos de Resultados');
    // editar: cambia el monto, se reaplica sin duplicar
    await A.evaluate(m=>openModalPagoQuincena(m,1), mesActual);
    await A.fill('#f-pq-monto','370000'); await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(([c,m])=>state.caja===c-370000 && state.pagos.filter(p=>p.costoFijoId==='jornales-1'&&p.periodo===m).length===1, [caja2, mesActual]), 'editar el monto actualiza el mismo gasto (caja −370.000, un solo gasto)');
    // 2ª quincena programada a futuro: no descuenta todavía
    const caja3=await A.evaluate(()=>state.caja);
    await A.evaluate(m=>openModalPagoQuincena(m,2), mesActual);
    await A.fill('#f-pq-fecha', '2099-01-01'); await A.click('#modal-content .modal-actions button.btn-primary');
    const filaQ2=await A.textContent('.cf-grid tr:has-text("2ª quincena") td:nth-child(2)');
    ok(/programado/.test(filaQ2) && await A.evaluate(c=>state.caja===c, caja3), 'con fecha futura queda programada y no descuenta todavía');
    // pagarla desde FIMA fondo Jornales: se cuenta UNA vez en Resultados
    await A.evaluate(()=>{ state.movimientosFima.push({id:'fmJ',fecha:today(),fondo:'jornales',obraId:null,subcategoria:null,concepto:'Aporte jornales',tipo:'in',monto:2000000}); recomputeFondos(); renderAll(); });
    const egr2=await A.evaluate(m=>computeMesResultado(m).totalEgresos, mesActual);
    await A.evaluate(m=>openModalPagoQuincena(m,2), mesActual);
    await A.fill('#f-pq-fecha', hoy); await A.selectOption('#f-forma','FIMA'); await A.selectOption('#f-fondo','jornales');
    await A.click('#modal-content .modal-actions button.btn-primary');
    const montoQ2=await A.evaluate(m=>getPagoQuincena(m,2).monto, mesActual);
    ok(await A.evaluate(q=>state.fondos.jornales===2000000-q, montoQ2), 'pagada con FIMA → fondo Jornales descuenta el fondo');
    ok(await A.evaluate(([m,e,q])=>computeMesResultado(m).totalEgresos===e+q, [mesActual, egr2, montoQ2]), 'y en Resultados cuenta una sola vez (antes se contaba dos veces)');
    // egreso cargado a mano en FIMA (fondo Jornales): también una sola vez
    const egr3=await A.evaluate(m=>computeMesResultado(m).totalEgresos, mesActual);
    await A.evaluate(()=>{ openModalMovimientoFima(); document.getElementById('f-fondo').value='jornales'; onFimaFondoChange(); document.getElementById('f-tipo2').value='out'; onFimaTipoChange(); document.getElementById('f-concepto').value='Sueldo suelto'; document.getElementById('f-monto').value='1000'; submitMovimientoFima(); });
    ok(await A.evaluate(([m,e])=>computeMesResultado(m).totalEgresos===e+1000, [mesActual, egr3]), 'un egreso del fondo Jornales cargado en FIMA también cuenta una sola vez');
    await esperarGuardado(A);
    const s=await dump();
    const pq=s.pagos.find(p=>p.costoFijoId==='jornales-1' && p.periodo===mesActual);
    ok(pq && pq.monto===370000 && pq.categoria==='sueldo', 'el gasto de la quincena quedó en la planilla, atado a la quincena');
    const adel=s.pagos.find(p=>p.trabajadorId==='t1');
    ok(adel && adel.descuentaPeriodo===mesActual && adel.descuentaQuincena===1, 'el adelanto quedó guardado con su trabajador y quincena');
    const B=await tab(b,'nuevo.html');
    ok(await B.evaluate(m=>desgloseQuincena(getTrabajador('t1'),m,1).total, mesActual)===350000, 'otra pestaña calcula el mismo sueldo con el adelanto');
    await B.evaluate(()=>{ showView('pagos'); setPagosFilter('fijo'); });
    ok(/370\.000,00/.test(await B.textContent('.cf-grid tr:has-text("1ª quincena") td:nth-child(2)')), 'otra pestaña ve la quincena registrada en la grilla');
    // Quitar el registro de la quincena y eliminar el adelanto
    const cajaB0=await B.evaluate(()=>state.caja);
    await B.evaluate(m=>quitarPagoQuincena(m,1), mesActual);
    ok(await B.evaluate(c=>state.caja===c+370000, cajaB0), 'quitar el registro de la quincena devuelve la plata a la caja');
    const cajaB=await B.evaluate(()=>state.caja);
    await B.evaluate(([m,id])=>{ openModalDetalleSueldo('t1',m); eliminarAdelanto(id,'t1',m); }, [mesActual, adel.id]);
    ok(await B.evaluate(c=>state.caja===c+50000, cajaB), 'eliminar el adelanto devuelve la plata a la caja');
    await esperarGuardado(B);
    const s2=await dump();
    ok(!s2.pagos.some(p=>p.id===adel.id) && !s2.pagos.some(p=>p.costoFijoId==='jornales-1'), 'quedan guardados el adelanto y la quincena eliminados');
    await A.close(); await B.close();
  });

  console.log('F3 — firmas digitales, OC sin "Recibí conforme" y orden de pago');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ showView('ordenes'); });
    await A.click('text=✍ Firmas');
    await A.fill('#f-firma-nombre-Solicita','Juan Pérez'); await A.fill('#f-firma-nombre-Aprueba','María Gómez');
    for(const clave of ['Solicita','Aprueba']){
      const box=await A.locator('#firma-pad-'+clave).boundingBox();
      await A.mouse.move(box.x+20, box.y+60); await A.mouse.down();
      for(let i=1;i<=20;i++) await A.mouse.move(box.x+20+i*12, box.y+60+Math.sin(i)*25);
      await A.mouse.up();
    }
    await A.click('#modal-content .modal-actions button.btn-primary');
    const e=await A.evaluate(()=>state.datosEmpresa);
    ok(/^data:image\/png/.test(e.firmaSolicitaImg) && /^data:image\/png/.test(e.firmaApruebaImg) && e.firmaApruebaImg.length<45000, 'las dos firmas quedaron como imagen (y livianas: '+e.firmaApruebaImg.length+' caracteres)');
    // OC pendiente: sin firma de aprobación; OC comprada y pagada: con ambas y con orden de pago
    await A.evaluate(()=>{
      state.proveedores.push({id:'pv1',nombre:'Proveedor SA'});
      state.ordenesCompra.push({id:'oc1',numero:'OC-0001',fecha:today(),solicitante:'Juan Pérez',tipo:'fijo',obraId:null,categoria:'otros',items:[{producto:'Tornillos',cantidad:10,unitario:100}],monto:1000,ivaAplica:false,proveedorId:'pv1',estado:'pendiente',comentarioDueno:null,pagoId:null,pagoIds:[],moneda:'ars'});
      renderAll();
    });
    await A.evaluate(()=>imprimirOrden('oc1'));
    let h=await A.evaluate(()=>window.__impreso);
    ok(!/Recibí conforme/.test(h) && /Aprobación comercial/.test(h) && /Solicitado por/.test(h), 'la OC ya no tiene "Recibí conforme"');
    ok((h.match(/<img src="data:image\/png/g)||[]).length===1, 'OC pendiente: sale solo la firma de quien solicita (no la aprobación)');
    ok(await A.evaluate(()=>!ocTienePagoReal(getOrden('oc1'))), 'sin pago todavía no ofrece orden de pago');
    await A.evaluate(()=>{
      const p={id:'pgoc',tipo:'fijo',obraId:null,categoria:'otros',concepto:'OC-0001',cantidad:1,unitario:1000,ivaAplica:false,monto:1000,proveedorId:'pv1',numeroFactura:null,fechaFactura:today(),formaPago:'Transferencia',fechaPago:today(),numeroOC:'OC-0001',origenFondo:null,pagosRealizados:[]};
      state.pagos.push(p); aplicarCompromisoDePago(p, today(), 'Transferencia', null);
      Object.assign(getOrden('oc1'), {estado:'comprada', pagoId:'pgoc'}); setOrdenesFilter('comprada'); renderAll();
    });
    ok(await A.isVisible('#ordenes-body >> text=⬇ Orden de pago'), 'la OC comprada y pagada ofrece "⬇ Orden de pago"');
    await A.click('#ordenes-body >> text=⬇ Orden de pago');
    h=await A.evaluate(()=>window.__impreso);
    ok(/ORDEN DE PAGO/.test(h) && /OP-0001/.test(h) && /Pagos realizados/.test(h) && /Transferencia/.test(h) && !/Recibí conforme/.test(h), 'la orden de pago muestra número, pagos realizados y firmas');
    ok((h.match(/<img src="data:image\/png/g)||[]).length===2 && /María Gómez/.test(h), 'la orden de pago sale con las dos firmas');
    await esperarGuardado(A);
    const B=await tab(b,'nuevo.html');
    ok(await B.evaluate(()=>/^data:image\/png/.test(state.datosEmpresa.firmaApruebaImg) && state.datosEmpresa.firmaApruebaNombre==='María Gómez'), 'las firmas persisten en la planilla (otra pestaña las ve)');
    await A.close(); await B.close();
  });

  console.log('F4 — una pestaña con la versión VIEJA de la app no borra lo nuevo');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    await A.evaluate(m=>{
      state.costosFijos.push({id:'cfX',nombre:'Alquiler',categoria:'alquiler',montoMensual:500000,formaPago:'Transferencia',diaPago:5});
      state.datosEmpresa.firmaSolicitaNombre='Juan'; state.datosEmpresa.firmaSolicitaImg='data:image/png;base64,AAAA'; marcarEditadoDatosEmpresa();
      openModalAdelanto('t1', m);
    }, mesActual);
    await A.fill('#f-adel-monto','1000'); await A.click('#modal-content .modal-actions button.btn-primary');
    await esperarGuardado(A);
    const V=await tab(b,'viejo.html');
    await V.evaluate(()=>{ state.pagos.push({id:'pgOld',tipo:'fijo',obraId:null,categoria:'otros',concepto:'De la vieja',cantidad:1,unitario:5,ivaAplica:false,monto:5,proveedorId:null,numeroFactura:null,fechaFactura:today(),formaPago:'A definir',fechaPago:null,numeroOC:null,origenFondo:null,pagosRealizados:[]}); renderAll(); });
    await esperarGuardado(V);
    const s=await dump();
    ok(s.pagos.some(p=>p.id==='pgOld'), 'lo que guardó la versión vieja se guardó');
    ok(s.costosFijos.length===1, 'los costos fijos siguen ahí');
    ok(s.datosEmpresa.firmaSolicitaImg==='data:image/png;base64,AAAA', 'las firmas siguen ahí');
    ok(s.pagos.some(p=>p.trabajadorId==='t1' && p.descuentaPeriodo), 'el adelanto sigue atado a su trabajador');
    await A.close(); await V.close();
  });

  console.log('F5 — dos pestañas cargan costos fijos a la vez (conflicto) sin perder nada');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html'), B=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ state.costosFijos.push({id:'cfA',nombre:'AYSA',categoria:'servicios',montoMensual:1,formaPago:'A definir',diaPago:1}); renderAll(); });
    await B.evaluate(()=>{ state.costosFijos.push({id:'cfB',nombre:'Gas',categoria:'servicios',montoMensual:2,formaPago:'A definir',diaPago:1}); renderAll(); });
    await esperarGuardado(A); await esperarGuardado(B);
    const s=await dump();
    ok(s.costosFijos.map(c=>c.id).sort().join(',')==='cfA,cfB', 'quedan los dos conceptos ('+s.costosFijos.map(c=>c.id).join(',')+')');
    await A.evaluate(()=>{ marcarEliminado('costosFijos','cfA'); state.costosFijos=state.costosFijos.filter(c=>c.id!=='cfA'); renderAll(); });
    await esperarGuardado(A);
    await B.evaluate(()=>refrescarDesdeServidor()); await B.waitForTimeout(400);
    ok(await B.evaluate(()=>!state.costosFijos.some(c=>c.id==='cfA')), 'un concepto borrado en A desaparece en B y no resucita');
    await A.close(); await B.close();
  });

  console.log('F6 — buscador al tipear (obras y materiales)');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    await A.evaluate(()=>{
      state.obras.push({...state.obras[0], id:'ob828', code:'X-828', cliente:'Pérez', documentos:[], ingresosList:[], jornalesConfig:{asignados:[],horasExtra:{},viaje:{}}});
      state.stock.push({id:'st1',nombre:'Lana de vidrio 50mm',unidad:'rollo',cantidad:10,costoUnitario:1000,categoria:'Lanas',stockMinimo:0});
      renderAll(); openModalCompra('ob1');
    });
    await A.fill('#f-obra-q','828');
    ok(await A.isVisible('#combo-dropdown >> text=X-828'), 'tipeando "828" aparece la obra X-828');
    await A.click('#combo-dropdown >> text=X-828');
    ok(await A.evaluate(()=>document.getElementById('f-obra').value)==='ob828', 'al elegirla queda seleccionada (por id)');
    await A.fill('#f-obra-q','perez'); await A.keyboard.press('Enter');
    ok(await A.evaluate(()=>document.getElementById('f-obra').value)==='ob828', 'también busca por cliente, sin acentos, y Enter elige');
    await A.selectOption('#f-cat','materiaPrima'); await A.check('#f-usostock');
    await A.fill('#f-stock-material-q','vidrio'); await A.keyboard.press('Enter');
    ok(await A.evaluate(()=>document.getElementById('f-stock-material').value==='st1' && document.getElementById('f-concepto').value==='Lana de vidrio 50mm'), 'material de stock: "vidrio" encuentra la lana y dispara el cambio');
    await A.fill('#f-cantidad','2'); await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(()=>state.stockMovimientos.some(m=>m.obraId==='ob828' && m.stockId==='st1' && m.cantidad===2)), 'el consumo de stock se registró en la obra elegida');
    // OC: sugerencias de producto
    await A.evaluate(()=>openModalOrdenCompra(null));
    await A.fill('#oc-items-body input >> nth=0','lana');
    ok(await A.isVisible('#combo-dropdown >> text=Lana de vidrio 50mm'), 'en la OC, el producto sugiere materiales de stock');
    await A.click('#combo-dropdown >> text=Lana de vidrio 50mm');
    ok(await A.evaluate(()=>ocItemsDraft[0].producto)==='Lana de vidrio 50mm', 'y al elegir queda cargado en el ítem');
    await A.evaluate(()=>closeModal());
    // FIMA: obra opcional
    await A.evaluate(()=>{ openModalMovimientoFima(); document.getElementById('f-fondo').value='obras'; onFimaFondoChange(); });
    await A.fill('#f-fima-obra-q','x-8'); await A.keyboard.press('Enter');
    ok(await A.evaluate(()=>document.getElementById('f-fima-obra').value)==='ob828', 'movimiento de FIMA: la obra también se busca tipeando');
    await A.evaluate(()=>closeModal());
    // Registrar compra sin obra elegida: avisa y no guarda
    const n=await A.evaluate(()=>state.pagos.length);
    await A.evaluate(()=>{ openModalCompra(null); document.getElementById('f-tipo').value='obra'; onTipoPagoChange(); });
    await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(c=>state.pagos.length===c, n), 'un gasto de obra sin obra elegida no se guarda');
    await A.close();
  });

  console.log('F7 — gastos variables y pestaña Compras de materiales');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    const hoy=new Date().toISOString().slice(0,10);
    await A.evaluate(()=>{ showView('pagos'); setPagosFilter('variable'); });
    await A.click('text=+ Registrar pago');
    ok(await A.evaluate(()=>document.getElementById('f-tipo').value)==='variable', 'desde la pestaña Gastos variables, "Registrar pago" viene como gasto variable');
    await A.selectOption('#f-cat','herramientas'); await A.fill('#f-concepto','Amoladora'); await A.fill('#f-unitario','1000');
    await A.uncheck('#f-sinfecha'); await A.fill('#f-fechapago', hoy);
    const caja0=await A.evaluate(()=>state.caja);
    await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(c=>state.caja===c-1000 && state.pagos.some(p=>p.tipo==='variable'&&p.categoria==='herramientas'&&p.concepto==='Amoladora'), caja0), 'se registra como gasto variable (Herramientas) y descuenta la caja');
    ok(await A.isVisible('#pagos-body >> text=Amoladora'), 'aparece en la pestaña Gastos variables');
    await A.evaluate(()=>setPagosCategoriaFilter('variable|viaticos'));
    ok(!(await A.isVisible('#pagos-body >> text=Amoladora')), 'el filtro por categoría (Viáticos) la oculta');
    await A.evaluate(()=>{ state.pagos.push({id:'pgSt',tipo:'stock',obraId:null,categoria:'stock',concepto:'Lana stock',cantidad:1,unitario:5,ivaAplica:false,monto:5,proveedorId:null,numeroFactura:null,fechaFactura:today(),formaPago:'A definir',fechaPago:null,numeroOC:null,origenFondo:null,pagosRealizados:[]}); state.pagos.push({id:'pgOb',tipo:'obra',obraId:'ob1',categoria:'materiaPrima',concepto:'Lana obra',cantidad:1,unitario:5,ivaAplica:false,monto:5,proveedorId:null,numeroFactura:null,fechaFactura:today(),formaPago:'A definir',fechaPago:null,numeroOC:null,origenFondo:null,pagosRealizados:[]}); setPagosFilter('compras'); renderAll(); });
    const compras=await A.textContent('#pagos-body');
    ok(/Lana stock/.test(compras) && /Lana obra/.test(compras) && !/Amoladora/.test(compras) && !/Gasto X/.test(compras), 'Compras de materiales junta obra y stock, sin fijos ni variables');
    await A.evaluate(()=>setPagosCategoriaFilter('stock|*'));
    const soloStock=await A.textContent('#pagos-body');
    ok(/Lana stock/.test(soloStock) && !/Lana obra/.test(soloStock), 'y se puede filtrar solo reposición de stock');
    // editar un gasto de stock no lo convierte en fijo
    await A.evaluate(()=>{ openModalCompra(null,'pgSt'); }); await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(()=>state.pagos.find(p=>p.id==='pgSt').tipo)==='stock', 'editar un gasto de stock lo deja como stock');
    // Resultados
    await A.evaluate(()=>showView('resultados'));
    ok(await A.isVisible('#res-egresos-body >> text=Variable: Herramientas y equipos'), 'Resultados muestra la categoría del gasto variable');
    // FIMA egreso como gasto variable
    await A.evaluate(()=>{ openModalMovimientoFima(); document.getElementById('f-fondo').value='otros'; onFimaFondoChange(); document.getElementById('f-tipo2').value='out'; onFimaTipoChange(); });
    ok(await A.isVisible('#f-fima-tipogasto'), 'un egreso de FIMA pregunta si es gasto fijo o variable');
    await A.selectOption('#f-fima-tipogasto','variable'); await A.selectOption('#f-fima-catvar','viaticos');
    await A.fill('#f-concepto','Almuerzo equipo'); await A.fill('#f-monto','300');
    await A.click('#modal-content .modal-actions button.btn-primary');
    ok(await A.evaluate(()=>state.pagos.some(p=>p.tipo==='variable'&&p.categoria==='viaticos'&&p.concepto==='Almuerzo equipo')), 'y queda en Pagos como gasto variable (Viáticos)');
    // OC de gasto variable
    await A.evaluate(()=>openModalOrdenCompra(null));
    await A.selectOption('#f-tipo','variable');
    ok(await A.evaluate(()=>[...document.getElementById('f-cat').options].some(o=>o.value==='herramientas')), 'la OC acepta tipo gasto variable con sus categorías');
    await A.evaluate(()=>closeModal());
    await esperarGuardado(A);
    const s=await dump();
    ok(s.pagos.filter(p=>p.tipo==='variable').length===2, 'los gastos variables quedan guardados en la planilla');
    await A.close();
  });

  await b.close();
  console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK');
  process.exit(fails?1:0);
})();
