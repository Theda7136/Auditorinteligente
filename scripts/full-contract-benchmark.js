const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const engine=require('../js/audit-engine');
const fixture=path.join(__dirname,'../tests/fixtures/contrato-ficticio-colombia');
function evaluate(){
 const text=fs.readFileSync(fixture+'.txt','utf8');
 const labels=JSON.parse(fs.readFileSync(fixture+'.labels.json','utf8'));
 const runs=Array.from({length:3},()=>engine.runLocalSimulation(text,labels.options));
 const result=runs[0];
 const rows=labels.risks.map(r=>{
  const start=text.indexOf(r.clause);
  const next=text.indexOf('\n\n',start);
  const end=next<0?text.length:next;
  const alert=result.alerts.find(a=>a.id===r.id);
  const evidence=alert?text.indexOf(alert.excerpt,start):-1;
  return {...r,detected:!!alert,literalClauseMatch:!!alert&&!!alert.excerpt&&evidence>=start&&evidence+alert.excerpt.length<=end,excerpt:alert?.excerpt||null};
 });
 const tp=rows.filter(r=>r.detected&&r.literalClauseMatch).length;
 const fp=result.alerts.filter(a=>a.id&&!rows.some(r=>r.id===a.id&&r.literalClauseMatch)).length;
 const fn=rows.length-tp;
 const precision=tp/(tp+fp)||0,recall=tp/(tp+fn)||0;
 return {kind:labels.status,inputSha256:crypto.createHash('sha256').update(text).digest('hex'),options:labels.options,expectedRiskFamilies:rows.length,detectedAlerts:result.alerts.length,score:result.score,tp,fp,fn,precision,recall,f1:2*precision*recall/(precision+recall)||0,consistent:runs.every(r=>r.score===result.score&&JSON.stringify(r.alerts)===JSON.stringify(result.alerts)),rows,analysis:result};
}
if(require.main===module)console.log(JSON.stringify(evaluate(),null,2));
module.exports={evaluate};
