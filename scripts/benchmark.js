// Synthetic linguistic benchmark: these labels are NOT a legal gold standard.
const engine = require('../js/audit-engine');
const cases = [
 ['renewal-pdf-fragment','EL CONTRATANTE podrá prorrogar unilateralmente el plazo hasta por seis meses.',['unilateral-renewal']],
 ['termination','El cliente podrá terminar unilateralmente sin causa.',['unilateral']],
 ['unlimited','La responsabilidad será ilimitada.',['unlimited-liability']],
 ['scope','El cliente podrá modificar el alcance sin ajuste del precio.',['scope-change']],
 ['payment','El cliente podrá retener pagos a su sola discreción.',['payment-withholding']],
 ['ip','El proveedor cede todos los derechos.',['ip-transfer']],
 ['balanced','Las partes pactan servicios por doce meses. El pago se realizará en treinta días. La ley aplicable y los tribunales serán los del país acordado. La responsabilidad de cada parte será recíproca y limitada al precio.',[]],
 ['negated','No existe responsabilidad ilimitada.',[]],
 ['balanced-penalty','Cláusula penal recíproca del 1% total por incumplimiento probado.',[]],
 ['balanced-renewal','Renovación automática con aviso previo y derecho de oposición de ambas partes.',[]]
];
let tp=0,fp=0,fn=0,tn=0,stable=0,quotes=0,totalQuotes=0;
const rows=[];
for(const jurisdiction of Object.keys(engine.JURISDICTIONS)) for(const party of ['proveedor','cliente','neutral']) for(const [id,text,expected] of cases){
 const runs=Array.from({length:3},()=>engine.runLocalSimulation(text,{jurisdiction,party}));
 const ids=runs[0].alerts.map(a=>a.id).filter(Boolean);
 const row={id,jurisdiction,party,expected,actual:ids,score:runs[0].score}; rows.push(row);
 tp+=ids.filter(x=>expected.includes(x)).length; fp+=ids.filter(x=>!expected.includes(x)).length; fn+=expected.filter(x=>!ids.includes(x)).length;
 if(!expected.length&&!ids.length)tn++;
 if(runs.every(r=>r.score===runs[0].score&&JSON.stringify(r.alerts)===JSON.stringify(runs[0].alerts)))stable++;
 for(const a of runs[0].alerts.filter(a=>a.id)){totalQuotes++;if(text.includes(a.excerpt))quotes++;}
}
const precision=tp/(tp+fp)||0,recall=tp/(tp+fn)||0;
console.log(JSON.stringify({kind:'synthetic-not-legal-validation',cases:rows.length,executions:rows.length*3,tp,fp,fn,tn,precision,recall,f1:2*precision*recall/(precision+recall)||0,consistency:stable/rows.length,literalQuoteRate:quotes/totalQuotes,falsePositiveDefinition:'unexpected risk IDs; balanced and negated controls included',rows},null,2));
