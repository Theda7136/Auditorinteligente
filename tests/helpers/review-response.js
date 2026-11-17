const engine=require('../../js/audit-engine');
module.exports=function(score=0, text='Texto.'){
 return {score,alerts:[],recommendations:['Revisar.'],coverage:engine.REVIEW_CATEGORIES.map(category=>({category,status:'not_detected',reason:'Control sintético sin riesgo etiquetado.'})),clauseReviews:engine.reviewUnits(text).map(u=>({clauseId:u.id,status:'not_detected',reason:'Unidad revisada en respuesta simulada.'}))};
};
