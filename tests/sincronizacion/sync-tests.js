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
  const p=await b.newPage(); p.on('dialog',d=>d.accept()); p.on('pageerror',e=>{console.log('   PAGEERROR',e.message); fails++;});
  await p.goto('file://'+__dirname+'/'+file);
  await p.waitForFunction(()=>typeof bootCompleto!=='undefined'&&bootCompleto);
  await p.waitForTimeout(300); return p;
}
const esperarGuardado=async p=>{ await p.waitForTimeout(1200); await p.waitForFunction(()=>!hayGuardadoPendiente,null,{timeout:15000}); await p.waitForTimeout(200); };
const idsF=s=>s.movimientosFima.map(m=>m.id).sort().join(',');
(async()=>{
  const b=await chromium.launch();

  console.log('T1 — borro duplicado en A; B (pestaña vieja abierta) refresca y guarda otra cosa');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html'), B=await tab(b,'nuevo.html');
    await A.evaluate(()=>eliminarDuplicadosFima()); await esperarGuardado(A);
    ok(idsF(await dump())==='fmA,fmC', 'servidor sin el duplicado después de borrar');
    await B.evaluate(()=>refrescarDesdeServidor()); await B.waitForTimeout(400);
    ok(await B.evaluate(()=>!state.movimientosFima.some(m=>m.id==='fmB')), 'B ya no ve el duplicado tras refrescar');
    await B.evaluate(()=>{ state.movimientosFima.push({id:'fmNEW',fecha:today(),fondo:'otros',obraId:null,subcategoria:null,concepto:'Nuevo B',tipo:'in',monto:5}); recomputeFondos(); renderAll(); });
    await esperarGuardado(B);
    const s=await dump(); ok(idsF(s)==='fmA,fmC,fmNEW', 'servidor: sin duplicado y con lo nuevo de B ('+idsF(s)+')');
    await A.close(); await B.close();
  });

  console.log('T2 — B carga algo SIN haber refrescado (conflicto) mientras A borra');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html'), B=await tab(b,'nuevo.html');
    await A.evaluate(()=>eliminarDuplicadosFima()); await esperarGuardado(A);
    await B.evaluate(()=>{ state.movimientosFima.push({id:'fmNEW2',fecha:today(),fondo:'otros',obraId:null,subcategoria:null,concepto:'Nuevo B2',tipo:'in',monto:7}); recomputeFondos(); renderAll(); });
    await esperarGuardado(B);
    const s=await dump(); ok(idsF(s)==='fmA,fmC,fmNEW2', 'conflicto resuelto: sin duplicado y con lo nuevo de B ('+idsF(s)+')');
    ok(await B.evaluate(()=>!state.movimientosFima.some(m=>m.id==='fmB')), 'B tampoco lo ve en pantalla');
    await A.close(); await B.close();
  });

  console.log('T3 — pestaña con la VERSIÓN VIEJA de la app abierta (protección del backend)');
  await withServer(async()=>{
    const V=await tab(b,'viejo.html'), A=await tab(b,'nuevo.html');
    await A.evaluate(()=>eliminarDuplicadosFima()); await esperarGuardado(A);
    await V.evaluate(()=>refrescarDesdeServidor()); await V.waitForTimeout(400);
    await V.evaluate(()=>{ state.movimientosFima.push({id:'fmOLD',fecha:today(),fondo:'otros',obraId:null,subcategoria:null,concepto:'De la vieja',tipo:'in',monto:9}); recomputeFondos(); renderAll(); });
    await esperarGuardado(V);
    const s=await dump(); ok(idsF(s)==='fmA,fmC,fmOLD', 'la versión vieja NO pudo resucitar el borrado, y lo suyo nuevo sí se guardó ('+idsF(s)+')');
    const sh=await fetch('http://127.0.0.1:8770/sheet/Eliminados').then(r=>r.json());
    ok(JSON.stringify(sh).includes('fmB'), 'la hoja Eliminados registró el borrado');
    await A.close(); await V.close();
  });

  console.log('T4 — quitar trabajador de obra, horas extra, documento y comisión con pestaña vieja abierta');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html'), B=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ quitarTrabajadorObra('ob1','t2'); setHorasExtraObra('ob1','t1',5); eliminarDocumentoObra('ob1','doc1'); getObra('ob1').comisionOverride={modo:'pct',valor:3}; marcarEditadoObra('ob1','comisionOverride'); renderAll(); });
    await esperarGuardado(A);
    await B.evaluate(()=>{ state.movimientosFima.push({id:'fmX',fecha:today(),fondo:'otros',obraId:null,subcategoria:null,concepto:'x',tipo:'in',monto:1}); recomputeFondos(); renderAll(); });
    await esperarGuardado(B);
    const o=(await dump()).obras[0];
    ok(JSON.stringify(o.jornalesConfig.asignados)==='["t1"]', 't2 sigue quitado de la obra ('+JSON.stringify(o.jornalesConfig.asignados)+')');
    ok(o.jornalesConfig.horasExtra.t1===5, 'horas extra de t1 quedan en 5 (no las pisa la copia vieja con 2)');
    ok(o.documentos.length===0, 'el documento borrado no vuelve');
    ok(o.comisionOverride && o.comisionOverride.valor===3, 'la comisión editada no se pisa con la copia vieja');
    await B.evaluate(()=>refrescarDesdeServidor()); await B.waitForTimeout(400);
    ok(await B.evaluate(()=>getObra('ob1').jornalesConfig.asignados.join(',')==='t1' && getObra('ob1').jornalesConfig.horasExtra.t1===5), 'B ve todo actualizado en pantalla');
    await A.close(); await B.close();
  });

  console.log('T5 — nada nuevo se pierde: A y B cargan cosas a la vez, con borrados de por medio');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html'), B=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ state.movimientosFima.push({id:'fmA2',fecha:today(),fondo:'otros',obraId:null,subcategoria:null,concepto:'A2',tipo:'in',monto:2}); eliminarDuplicadosFima(); });
    await B.evaluate(()=>{ state.movimientosFima.push({id:'fmB2',fecha:today(),fondo:'otros',obraId:null,subcategoria:null,concepto:'B2',tipo:'in',monto:3}); asignarTrabajadorObra('ob1','t3'); state.trabajadores.push({id:'t9',nombre:'Nuevo',puesto:'x',sueldoMensual:0}); renderAll(); });
    await esperarGuardado(A); await esperarGuardado(B);
    await A.evaluate(()=>refrescarDesdeServidor()); await B.evaluate(()=>refrescarDesdeServidor()); await A.waitForTimeout(500);
    const s=await dump();
    ok(idsF(s)==='fmA,fmA2,fmB2,fmC', 'servidor tiene lo de A y lo de B, sin el duplicado ('+idsF(s)+')');
    ok(s.obras[0].jornalesConfig.asignados.includes('t3') && s.trabajadores.some(t=>t.id==='t9'), 'la asignación y el trabajador nuevos de B se guardaron');
    ok(await A.evaluate(()=>state.movimientosFima.map(m=>m.id).sort().join(','))===idsF(s), 'A ve lo mismo que el servidor');
    ok(await B.evaluate(()=>state.movimientosFima.map(m=>m.id).sort().join(','))===idsF(s), 'B ve lo mismo que el servidor');
    await A.close(); await B.close();
  });

  console.log('T6 — un alta de otro dispositivo aparece sola en las demás pestañas');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html'), B=await tab(b,'nuevo.html');
    await A.evaluate(()=>{ state.pagos.push({id:'pgNEW',tipo:'fijo',obraId:null,categoria:'otros',concepto:'Nuevo',cantidad:1,unitario:10,ivaAplica:false,monto:10,proveedorId:null,numeroFactura:null,fechaFactura:today(),formaPago:'A definir',fechaPago:null,numeroOC:null,origenFondo:null,pagosRealizados:[]}); renderAll(); });
    await esperarGuardado(A);
    await B.evaluate(()=>refrescarDesdeServidor()); await B.waitForTimeout(400);
    ok(await B.evaluate(()=>state.pagos.some(p=>p.id==='pgNEW')), 'B ve el gasto nuevo de A sin recargar');
    // A borra el gasto; B deja de verlo
    await A.evaluate(()=>{ marcarEliminado('pagos','pgNEW'); state.pagos=state.pagos.filter(p=>p.id!=='pgNEW'); renderAll(); });
    await esperarGuardado(A);
    await B.evaluate(()=>refrescarDesdeServidor()); await B.waitForTimeout(400);
    ok(await B.evaluate(()=>!state.pagos.some(p=>p.id==='pgNEW')), 'y cuando A lo borra, B deja de verlo');
    await A.close(); await B.close();
  });

  console.log('T7 — resguardo: lista vacía sospechosa del servidor no borra nada');
  await withServer(async()=>{
    const A=await tab(b,'nuevo.html');
    const r=await A.evaluate(()=>{ const loc=[1,2,3,4,5,6].map(i=>({id:'z'+i})); loc.forEach(x=>vistosEnServidor.pagos.add(x.id)); return unionPorId(loc, [], new Set(), new Set(), vistosEnServidor.pagos, 'pagos').length; });
    ok(r===6, 'con el servidor devolviendo una lista vacía, se conservan los 6 registros');
    const r2=await A.evaluate(()=>unionPorId([{id:'z1'},{id:'nuevo'}], [{id:'z2'}], new Set(), new Set(), vistosEnServidor.pagos, 'pagos').map(x=>x.id).sort().join(','));
    ok(r2==='nuevo,z2', 'caso normal: lo borrado en otro lado se va, lo nuevo local se queda ('+r2+')');
    await A.close();
  });

  await b.close();
  console.log(fails? `\n${fails} FALLA(S)` : '\nTODO OK'); process.exit(fails?1:0);
})();
