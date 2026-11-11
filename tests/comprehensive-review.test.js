const test=require('node:test'), assert=require('node:assert/strict');
const engine=require('../js/audit-engine');
const empty=require('./helpers/review-response');
test('rechaza lista de cinco hallazgos sin revisión de cláusulas y categorías',()=>{
 assert.throws(()=>engine.validateComprehensiveAnalysis({score:100,alerts:[],recommendations:[]},'Texto.',{}),/INCOMPLETE_COVERAGE/);
 const r=empty();r.coverage.pop();assert.throws(()=>engine.validateComprehensiveAnalysis(r,'Texto.',{}),/INCOMPLETE_COVERAGE/);
});
test('cada afirmación requiere una cita de su propia unidad y decisiones coherentes',()=>{
 const text='PRIMERA. PAGO\nPago en noventa días.\nSEGUNDA. RETENCIÓN\nEl cliente podrá retener pagos a su sola discreción.';
 const r=empty(80,text);
 r.alerts=[{level:'high',title:'Pagos',desc:'Esta frase libre no debe mostrarse',excerpt:'Pago en noventa días.',category:'payment-withholding',claims:[{statement:'El pago se aplaza noventa días.',excerpt:'Pago en noventa días.',clauseId:'C1'},{statement:'El cliente puede retener pagos discrecionalmente.',excerpt:'El cliente podrá retener pagos a su sola discreción.',clauseId:'C2'}]}];
 r.clauseReviews.forEach(c=>c.status='risk');r.coverage.find(c=>c.category==='payment-withholding').status='risk';
 const valid=engine.validateComprehensiveAnalysis(r,text,{});
 assert.equal(valid.alerts[0].evidence.length,2);assert.doesNotMatch(valid.alerts[0].desc,/frase libre/);
 r.alerts[0].claims[1].clauseId='C1';assert.throws(()=>engine.validateComprehensiveAnalysis(r,text,{}),/UNVERIFIED_CLAIMS/);
});
test('comprobación local registra posible omisión sin añadir alertas a Gemini',()=>{
 const text='El cliente podrá retener pagos a su sola discreción.';
 const r=engine.validateComprehensiveAnalysis(empty(0,text),text,{});
 assert.equal(r.alerts.length,0);assert.equal(r.reviewStatus,'needs_review');
 assert.ok(r.independentCheck.possibleOmissions.includes('payment-withholding'));
 assert.match(r.recommendations[0],/independiente/);
});
test('riesgo declarado sin alerta no pasa como revisión completa',()=>{
 const r=empty();r.coverage[0].status='risk';assert.throws(()=>engine.validateComprehensiveAnalysis(r,'Texto.',{}),/INCOMPLETE_COVERAGE/);
});
test('no acepta citas abreviadas aunque la idea aparezca en el contrato',()=>{
 const text='El proveedor responderá por daños. La responsabilidad será ilimitada.';
 const r=empty(80,text);
 r.alerts=[{level:'high',title:'Responsabilidad',desc:'x',excerpt:'El proveedor... ilimitada.',category:'unlimited-liability',claims:[{statement:'Responsabilidad ilimitada',excerpt:'El proveedor... ilimitada.',clauseId:'C1'}]}];
 assert.throws(()=>engine.validateComprehensiveAnalysis(r,text,{}),/Unverified quote/);
});
