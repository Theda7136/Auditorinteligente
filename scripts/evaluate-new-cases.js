const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const engine=require('../js/audit-engine');
const file=path.join(__dirname,'../tests/fixtures/evaluacion-nueva.json');
const raw=fs.readFileSync(file),dataset=JSON.parse(raw);
function evaluate(expected, actual){
 actual=[...new Set(actual)];
 const tp=actual.filter(x=>expected.includes(x)),fp=actual.filter(x=>!expected.includes(x)),fn=expected.filter(x=>!actual.includes(x));
 return {tp,fp,fn};
}
function metrics(rows){
 const valid=rows.filter(r=>r.status==='success');
 const tp=valid.reduce((n,r)=>n+r.tp.length,0),fp=valid.reduce((n,r)=>n+r.fp.length,0),fn=valid.reduce((n,r)=>n+r.fn.length,0);
 const precision=tp+fp?tp/(tp+fp):null,recall=tp+fn?tp/(tp+fn):null;
 const negative=valid.filter(r=>!r.expected.length);
 return {successfulCases:valid.length,failedCases:rows.length-valid.length,tp,fp,fn,precision,recall,f1:precision!==null&&recall!==null&&(precision+recall)>0?2*precision*recall/(precision+recall):0,negativeCases:negative.length,negativeCasesWithAlerts:negative.filter(r=>r.actual.length).length};
}
async function run(analyze){
 const rows=[];
 for(const c of dataset.cases){
  const options={jurisdiction:c.jurisdiction,party:c.party,contractType:'Servicios'};
  const local=engine.runLocalSimulation(c.text,options);
  const actual=local.alerts.map(a=>a.id).filter(Boolean);
  const localRow={id:c.id,engine:'local',status:'success',expected:c.expected,actual,score:local.score,...evaluate(c.expected,actual)};
  rows.push(localRow);
  if(analyze){
   const outcome=await analyze({...options,contractText:c.text,model:engine.DEFAULT_MODEL});
   if(outcome.status===200){
    const a=outcome.body.analysis,actual=a.alerts.map(x=>x.category);
    rows.push({id:c.id,engine:'gemini',status:'success',expected:c.expected,actual,score:a.score,...evaluate(c.expected,actual),reviewStatus:a.reviewStatus,provenance:outcome.body.provenance,analysis:a});
   }else rows.push({id:c.id,engine:'gemini',status:'failed',expected:c.expected,code:outcome.body.code,diagnostic:outcome.body.diagnostic});
  }
  console.error('Evaluado: '+c.id);
 }
 return {datasetHash:crypto.createHash('sha256').update(raw).digest('hex'),labelStatus:dataset.labelStatus,timestamp:new Date().toISOString(),local:metrics(rows.filter(r=>r.engine==='local')),gemini:analyze?metrics(rows.filter(r=>r.engine==='gemini')):null,rows};
}
module.exports={run};
if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2)));
