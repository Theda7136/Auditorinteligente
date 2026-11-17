const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/audit-engine');
const cases = [
 ['subjective-acceptance',
  'El cliente aprobará los entregables a su exclusivo criterio según sus expectativas.',
  'La aceptación se realizará sin plazo máximo para formular observaciones o rechazar el entregable.',
  'La aceptación exige superar las pruebas acordadas. El cliente formulará observaciones dentro de diez días.',
  'El pago sigue a la aceptación. El cliente podrá retener pagos a su sola discreción.'],
 ['client-dependencies',
  'La demora del cliente en los accesos no dará derecho a ampliar los plazos.',
  'El proveedor asumirá el retraso del contratante en las decisiones sin extensión de los plazos.',
  'La demora del cliente en los accesos dará derecho a ampliar los plazos.',
  'El retraso del proveedor en sus entregas no dará derecho a ampliar los plazos.'],
 ['third-party-indemnity',
  'El proveedor asumirá el pago de reclamaciones de terceros sin necesidad de una decisión que determine responsabilidad.',
  'El cliente podrá celebrar acuerdos con terceros sin consentimiento del proveedor y exigir el reembolso.',
  'El proveedor asumirá reclamaciones por hechos propios determinados y participará en la defensa.',
  'Los acuerdos con terceros requieren consentimiento del proveedor antes de exigir reembolso.'],
 ['personal-data',
  'El proveedor conservará copias de los datos por tiempo indefinido.',
  'Se enviarán datos personales a servicios externos sin definir finalidades ni medidas de seguridad.',
  'Los datos personales se suprimirán treinta días después de terminar el servicio.',
  'Las finalidades, destinatarios y conservación de datos se acuerdan previamente por escrito.'],
 ['noncompete',
  'El proveedor no podrá prestar servicios a competidores en cualquier país.',
  'Se prohíbe ofrecer servicios a empresas del mismo sector en todo el mundo.',
  'El proveedor podrá prestar servicios a competidores sin revelar secretos del cliente.',
  'El proveedor no podrá revelar datos a competidores en cualquier país.'],
 ['support-sla',
  'El soporte deberá resolver cualquier incidente con independencia de su complejidad.',
  'El proveedor debe resolver todo incidente sin considerar la severidad.',
  'El soporte responderá en dos horas y resolverá incidentes según severidad y complejidad.',
  'El soporte registrará cualquier incidente con independencia de su complejidad.'],
 ['asymmetric-assignment',
  'El contratante podrá ceder el contrato sin autorización del proveedor. El contratista no podrá ceder sin permiso.',
  'El cliente podrá ceder el contrato sin consentimiento del proveedor. El proveedor no podrá ceder el contrato.',
  'El cliente y el proveedor podrán ceder el contrato con consentimiento de la otra parte.',
  'El cliente podrá ceder el contrato con autorización del proveedor. El proveedor podrá ceder con autorización del cliente.'],
 ['foreign-arbitration',
  'El arbitraje se celebrará en Madrid. El contratista anticipará la totalidad de los honorarios.',
  'En el procedimiento arbitral el proveedor adelantará la totalidad de los gastos.',
  'El arbitraje se celebrará en Madrid; cada parte anticipará la mitad de los honorarios.',
  'Los gastos arbitrales se repartirán conforme a lo acordado por ambas partes.']
];
for (const [id, ...texts] of cases) {
 for (const jurisdiction of ['CO','MX','ES','PE','CL','AR','OTRO']) {
  test(`${id}: variantes y controles equilibrados (${jurisdiction})`,()=>{
   for (const [index,text] of texts.entries()) {
    for (const party of ['proveedor','cliente','neutral']) {
     const result=engine.runLocalSimulation(text,{jurisdiction,party});
     const alert=result.alerts.find(a=>a.id===id);
     assert.equal(!!alert,index<2,`${party}: ${text}`);
     if(alert)assert.equal(text.slice(alert.evidenceStart,alert.evidenceEnd),alert.excerpt);
    }
   }
  });
 }
}
test('no une hechos de cláusulas distintas para inventar una cesión asimétrica',()=>{
 const text='El cliente podrá ceder el contrato sin autorización del proveedor.\n\nOtro contrato: el proveedor no podrá ceder las licencias de terceros.';
 assert.ok(!engine.runLocalSimulation(text,{}).alerts.some(a=>a.id==='asymmetric-assignment'));
});
module.exports={cases};
