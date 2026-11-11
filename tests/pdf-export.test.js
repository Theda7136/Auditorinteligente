const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const engine=require('../js/audit-engine');
test('PDF usa el análisis actual, conserva motor y pagina párrafos extensos',()=>{
 const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
 const fn=source.slice(source.indexOf('    function exportPdf()'),source.indexOf('    function readFile('));
 const printed=[];const positions=[];let pages=1;
 class Pdf {
  constructor(){this.internal={pageSize:{getWidth:()=>210,getHeight:()=>297},getNumberOfPages:()=>pages};}
  setFont(){} setFontSize(){} setTextColor(){} setFillColor(){} rect(){} setPage(){} save(){}
  splitTextToSize(text){return String(text).match(/.{1,60}/g)||[''];}
  addPage(){pages++;}
  text(text,x,y){assert.ok(y<=289);printed.push(String(text));positions.push({text:String(text),page:pages,y});}
 }
 const data={score:90,source:'Gemini (test)',contractType:'Servicios',jurisdiction:'CO',party:'proveedor',provenance:{engine:'gemini',analysisId:'test-id'},alerts:[{title:'Hallazgo',level:'high',desc:'texto '.repeat(2000),excerpt:'Cita literal'},...Array.from({length:30},()=>({title:'Hallazgo',level:'medium',desc:'Descripción breve.',excerpt:'Cita literal'}))],recommendations:[]};
 vm.runInNewContext(fn+';exportPdf();',{currentAnalysis:data,window:{jspdf:{jsPDF:Pdf}},engine,pdfSafe:x=>String(x),showNotice:()=>assert.fail('unexpected notice')});
 assert.ok(pages>2);
 const output=printed.join(' ');
 assert.match(output,/Gemini \(test\)/);assert.match(output,/90 \/ 100/);assert.match(output,/test-id/);assert.match(output,/Cita literal/);
 assert.doesNotMatch(output,/Simulación local/);
 for(let i=0;i<positions.length;i++)if(/^\d+\. Hallazgo/.test(positions[i].text))assert.equal(positions[i].page,positions[i+1].page,'Heading orphaned');
 data.alerts=[{title:'Dos afirmaciones',level:'high',desc:'Resumen',excerpt:'Primera cita',evidence:[{clauseId:'C1',statement:'Primera afirmación',excerpt:'Primera cita'},{clauseId:'C2',statement:'Segunda afirmación',excerpt:'Segunda cita'}]}];
 printed.length=0;
 vm.runInNewContext(fn+';exportPdf();',{currentAnalysis:data,window:{jspdf:{jsPDF:Pdf}},engine,pdfSafe:x=>String(x),showNotice:()=>assert.fail('unexpected notice')});
 assert.match(printed.join(' '),/Segunda cita/);assert.match(printed.join(' '),/C2/);
});
