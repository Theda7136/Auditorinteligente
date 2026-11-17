const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=require('../js/audit-engine');
const text=fs.readFileSync(require.resolve('./fixtures/contrato-ficticio-colombia.txt'),'utf8');
for (const [name,input] of [
 ['blank lines',text.replace(/\n/g,'\n\n')],
 ['Windows newlines',text.replace(/\n/g,'\r\n\r\n')],
 ['Markdown headings',text.replace(/^((?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA)[^\n]*)/gm,'## $1').replace(/\n/g,'\n\n')]
]) test('16 riesgos con '+name,()=>{
 const result=engine.runLocalSimulation(input,{jurisdiction:'CO',party:'proveedor',contractType:'Servicios'});
 assert.equal(result.alerts.length,16);
 const a=result.alerts.find(a=>a.id==='asymmetric-assignment');
 assert.ok(a);assert.match(a.excerpt,/DÉCIMA SEXTA/);assert.doesNotMatch(a.excerpt,/DÉCIMA SÉPTIMA/);
 assert.equal(input.slice(a.evidenceStart,a.evidenceEnd),a.excerpt);
});
test('no combina condiciones entre cláusulas explícitas',()=>{
 const input='PRIMERA. CESIÓN\nEl cliente podrá ceder el contrato sin autorización del proveedor.\n\nSEGUNDA. LICENCIAS\nEl proveedor no podrá ceder licencias.';
 assert.ok(!engine.runLocalSimulation(input,{}).alerts.some(a=>a.id==='asymmetric-assignment'));
});
