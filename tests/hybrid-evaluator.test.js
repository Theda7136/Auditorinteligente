

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareAnalyses } = require('../js/hybrid-evaluator.js');

const contract = 'Cláusula 1. El proveedor responderá sin límite.\nCláusula 2. Renovación automática sin aviso.';

const local = {
    alerts: [
        {
            id: 'unlimited-liability',
            title: 'Responsabilidad ilimitada',
            excerpt: 'responderá sin límite'
        },
        {
            id: 'renewal',
            title: 'Renovación',
            excerpt: 'Renovación automática'
        }
    ]
};

const gemini = {
    alerts: [
        {
            category: 'unlimited-liability',
            title: 'Responsabilidad',
            claims: [{ clauseId: 'C1', excerpt: 'responderá sin límite' }]
        },
        {
            category: 'scope-change',
            title: 'Alcance',
            claims: [{ clauseId: 'C2', excerpt: 'Renovación automática' }]
        }
    ]
};

test('identifica coincidencias y discrepancias', () => {
    const comparison = compareAnalyses(contract, local, gemini);

    assert.equal(comparison.agreements.length, 1);
    assert.equal(comparison.localOnly.length, 1);
    assert.equal(comparison.geminiOnly.length, 1);
    assert.equal(comparison.needsReview.length, 2);
});

test('no mezcla riesgos de cláusulas distintas', () => {
    const other = {
        alerts: [{
            category: 'unlimited-liability',
            claims: [{ clauseId: 'C2' }]
        }]
    };

    const comparison = compareAnalyses(
        contract,
        { alerts: [local.alerts[0]] },
        other
    );

    assert.equal(comparison.agreements.length, 0);
});

test('ignora alertas informativas sin identificador', () => {
    const comparison = compareAnalyses(
        contract,
        { alerts: [{ title: 'Sin riesgos evidentes' }] },
        { alerts: [] }
    );

    assert.equal(comparison.localOnly.length, 0);
});

test('rechaza análisis incompletos', () => {
    assert.throws(
        () => compareAnalyses(contract, {}, gemini),
        TypeError
    );
});

