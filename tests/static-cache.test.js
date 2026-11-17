const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../server');
test('HTML y archivos versionados no reutilizan la interfaz anterior',async()=>{
 const server=createServer({dbPath:':memory:'});
 const handler=server.listeners('request')[0];
 try {
  for(const url of ['/', '/js/app.js?v=ui-v6','/js/audit-engine.js?v=ui-v6','/css/app.css?v=ui-v6']){
   const response=await new Promise((resolve,reject)=>{
    const headers={};let status=0;
    handler({url,method:'GET',headers:{},socket:{}},{setHeader(k,v){headers[k]=v;},writeHead(s,h){status=s;Object.assign(headers,h);},end(body){resolve({status,headers,body:String(body)});}}).catch(reject);
   });
   assert.equal(response.status,200);
   assert.equal(response.headers['Cache-Control'],'no-store');
   if(url==='/'){
    assert.match(response.body,/css\/app\.css\?v=ui-v6/);
    assert.match(response.body,/js\/app\.js\?v=ui-v6/);
   }
  }
 }finally{server.emit('close');}
});
