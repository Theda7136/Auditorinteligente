
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/audit-engine');

const cases = [
    {
        name: 'penalidad recíproca y limitada',
        text: 'Cláusula penal recíproca del 1% total por incumplimiento probado.',
        rule: 'penalty',
        expected: false
    },
    {
        name: 'penalidad diaria elevada',
        text: 'Cláusula penal del 2% diario por incumplimiento.',
        rule: 'penalty',
        expected: true
    },
    {
        name: 'penalidad unilateral sin límite',
        text: 'El proveedor pagará una cláusula penal por cualquier incumplimiento.',
        rule: 'penalty',
        expected: true
    },
    {
        name: 'renovación con oposición recíproca',
        text: 'Renovación automática con aviso previo y derecho de oposición de ambas partes.',
        rule: 'renewal',
        expected: false
    },
    {
        name: 'renovación sin derecho de oposición',
        text: 'El contrato tendrá renovación automática sin derecho de oposición.',
        rule: 'renewal',
        expected: true
    },
    {
        name: 'renovación con aviso solo para el cliente',
        text: 'Renovación automática con aviso previo y derecho de oposición exclusivo del cliente.',
        rule: 'renewal',
        expected: true
    }
];

for (const scenario of cases) {
    test(scenario.name, () => {
        const analysis = engine.runLocalSimulation(scenario.text, {
            jurisdiction: 'CO',
            party: 'neutral'
        });

        const detected = analysis.alerts.some(
            alert => alert.id === scenario.rule
        );

        assert.equal(detected, scenario.expected);
    });
}
