const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../scripts/full-contract-benchmark');
test('contrato completo: evidencia de cada riesgo detectado corresponde a su cláusula',()=>{
 const r=evaluate();
 assert.equal(r.expectedRiskFamilies,16);
 assert.equal(r.tp,16);
 assert.equal(r.fn,0);
 assert.equal(r.fp,0);
 assert.equal(r.consistent,true);
 for(const row of r.rows.filter(r=>r.detected))assert.equal(row.literalClauseMatch,true,row.id);
 const penalty=r.analysis.alerts.find(a=>a.id==='penalty');
 assert.match(penalty.excerpt,/2 %/);
 assert.equal(penalty.level,'high');
 assert.match(penalty.desc,/2% diario/);
 assert.ok(r.analysis.alerts.some(a=>a.id==='unlimited-liability'));
});
