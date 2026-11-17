const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/audit-engine');
const { createAuthStore } = require('../auth-store');

test('una cuota corta no borra una cuota horaria vigente', () => {
    const store=createAuthStore(':memory:');
    try {
        assert.equal(store.consumeAnalysisQuota([{key:'hour',limit:1}],1000000,3600000).allowed,true);
        store.consumeAnalysisQuota([{key:'minute',limit:20}],1120000,60000);
        assert.equal(store.consumeAnalysisQuota([{key:'hour',limit:1}],1120001,3600000).allowed,false);
        assert.equal(store.consumeAnalysisQuota([{key:'hour',limit:1}],4600000,3600000).allowed,true);
    } finally {store.close();}
});

test('la prórroga citada en los tres PDF no es terminación', () => {
    const text = 'EL CONTRATANTE podrá prorrogar unilateralmente el plazo hasta por seis (6) meses adicionales.';
    const result = engine.runLocalSimulation(text, {jurisdiction: 'CO', party: 'proveedor'});
    assert.ok(result.alerts.some(a => a.id === 'unilateral-renewal'));
    assert.ok(!result.alerts.some(a => a.id === 'unilateral'));
    for (const a of result.alerts) assert.ok(text.includes(a.excerpt));
});

test('una terminación separada no toma la evidencia de prórroga', () => {
    const text = 'El cliente podrá prorrogar unilateralmente el plazo.\nEl cliente podrá terminar unilateralmente sin causa.';
    const result = engine.runLocalSimulation(text, {});
    const alert = result.alerts.find(a => a.id === 'unilateral');
    assert.match(alert.excerpt, /terminar/);
    assert.doesNotMatch(alert.excerpt, /prorrogar/);
    assert.equal(result.score, Math.min(100, 8 + result.scoring.contributions.reduce((n,x)=>n+x.impact,0)));
});

test('valida citas literales, esquema y respuesta vacía válida sin inventar alertas', () => {
    assert.throws(() => engine.validateModelAnalysis({}, 'Contrato'));
    assert.throws(() => engine.validateModelAnalysis({score: 50, alerts: [{level:'high',title:'Riesgo',desc:'x',excerpt:'inventado'}],recommendations:[]}, 'Contrato'));
    assert.equal(engine.validateModelAnalysis({score:0, alerts:[], recommendations:[]}, 'Contrato').alerts.length,0);
    const a=engine.validateModelAnalysis({score:20, alerts:[{level:'medium',title:'Riesgo',desc:'x',excerpt:'literal'}],recommendations:[]}, 'Una cita literal.');
    assert.equal(a.alerts[0].evidenceStart,9);
});

test('historial y texto conservan procedencia y causa de respaldo', () => {
    const data=engine.runLocalSimulation('Responsabilidad ilimitada.',{});
    data.provenance.fallbackReason='AUTH';
    const record=engine.createHistoryRecord({data,fullText:'Responsabilidad ilimitada.'});
    assert.deepEqual(record.data.provenance,data.provenance);
    assert.match(engine.buildReportText(record.data), /Motivo del respaldo: AUTH/);
});
