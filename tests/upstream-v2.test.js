const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeContract}=require('../server');
test('errores upstream y respuestas incompletas nunca se presentan como éxito Gemini',async()=>{
 const previousKey=process.env.GEMINI_API_KEY, previousFetch=global.fetch;
 process.env.GEMINI_API_KEY='test-only';
 try {
  for(const [status,code] of [[403,'AUTH'],[404,'MODEL'],[429,'RATE'],[500,'UPSTREAM_ERROR']]){
   global.fetch=async()=>new Response('{}',{status});
   assert.equal((await analyzeContract({contractText:'Texto.'})).body.code,code);
  }
  global.fetch=async()=>Response.json({error:{status:'INVALID_ARGUMENT',message:'thinkingConfig incompatible SECRET_CONTRACT test-only'}},{status:400});
  const diagnostic=await analyzeContract({contractText:'Texto.'});
  assert.equal(diagnostic.body.code,'UPSTREAM_INVALID_REQUEST');
  assert.equal(diagnostic.body.diagnostic.reason,'THINKING_CONFIGURATION');
  assert.equal(diagnostic.body.diagnostic.httpStatus,400);
  assert.doesNotMatch(JSON.stringify(diagnostic),/SECRET_CONTRACT|test-only/);
  global.fetch=async()=>{throw Object.assign(new Error('secret'),{name:'TimeoutError'});};
  assert.equal((await analyzeContract({contractText:'Texto.'})).body.code,'UPSTREAM_TIMEOUT');
  for(const [candidate,code] of [
   [{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}},'INCOMPLETE_RESPONSE'],
   [{content:{parts:[{text:'{}'}]}},'INVALID_RESPONSE'],
   [{content:{parts:[{text:JSON.stringify({score:20,alerts:[{level:'high',title:'x',desc:'x',excerpt:'inventada'}],recommendations:[]})}]}},'UNVERIFIED_CLAIMS']
  ]) {
   global.fetch=async()=>Response.json({candidates:[candidate]});
   assert.equal((await analyzeContract({contractText:'Texto.'})).body.code,code);
  }
  global.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(require('./helpers/review-response')(0))}]}}]});
  const result=await analyzeContract({contractText:'Texto.'});
  assert.equal(result.body.provenance.engine,'gemini');
  assert.match(result.body.provenance.inputSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.body.analysis.alerts.length,0);
  let attempts=0;
  global.fetch=async()=>{attempts++;return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(attempts===1?{score:0,alerts:[],recommendations:[]}:require('./helpers/review-response')(0))}]}}]});};
  const repaired=await analyzeContract({contractText:'Texto.'});
  assert.equal(repaired.status,200);assert.equal(attempts,2);assert.equal(repaired.body.provenance.correctionAttempts,1);
  attempts=0;
  global.fetch=async()=>{attempts++;return Response.json({candidates:[{content:{parts:[{text:'{}'}]}}]});};
  assert.equal((await analyzeContract({contractText:'Texto.'})).status,502);assert.equal(attempts,2);
 } finally {global.fetch=previousFetch;if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;}
});
