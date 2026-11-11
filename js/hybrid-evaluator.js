

'use strict';

const engine = require('./audit-engine.js');

function findClause(text, excerpt, units) {
    if (typeof excerpt !== 'string' || !excerpt) return null;

    const position = text.indexOf(excerpt);
    if (position < 0) return null;

    const clause = units.find(unit =>
        position >= unit.start &&
        position + excerpt.length <= unit.end
    );

    return clause?.id ?? null;
}

function compareAnalyses(contractText, localAnalysis, geminiAnalysis) {
    if (
        typeof contractText !== 'string' ||
        !Array.isArray(localAnalysis?.alerts) ||
        !Array.isArray(geminiAnalysis?.alerts)
    ) {
        throw new TypeError('Se requieren el contrato y ambos análisis.');
    }

    const units = engine.reviewUnits(contractText);

    const localFindings = localAnalysis.alerts
        .filter(alert => alert.id)
        .map(alert => ({
            category: alert.id,
            title: alert.title,
            excerpt: alert.excerpt,
            clauseId: findClause(contractText, alert.excerpt, units),
            source: 'local'
        }));

    const geminiFindings = geminiAnalysis.alerts.map(alert => ({
        category: alert.category,
        title: alert.title,
        excerpt: alert.excerpt,
        clauseIds: [...new Set(
            (alert.claims || alert.evidence || [])
                .map(claim => claim.clauseId)
                .filter(Boolean)
        )],
        source: 'gemini'
    }));

    const agreements = [];
    const localOnly = [];
    const matchedGemini = new Set();

    for (const local of localFindings) {
        const matchIndex = geminiFindings.findIndex((gemini, index) =>
            !matchedGemini.has(index) &&
            gemini.category === local.category &&
            local.clauseId !== null &&
            gemini.clauseIds.includes(local.clauseId)
        );

        if (matchIndex === -1) {
            localOnly.push(local);
            continue;
        }

        matchedGemini.add(matchIndex);
        agreements.push({
            category: local.category,
            clauseId: local.clauseId,
            local,
            gemini: geminiFindings[matchIndex]
        });
    }

    const geminiOnly = geminiFindings.filter(
        (_, index) => !matchedGemini.has(index)
    );

    return {
        agreements,
        localOnly,
        geminiOnly,
        needsReview: [...localOnly, ...geminiOnly],
        summary: {
            agreements: agreements.length,
            localOnly: localOnly.length,
            geminiOnly: geminiOnly.length
        },
        note: 'Las discrepancias requieren revisión humana.'
    };
}

module.exports = { compareAnalyses };

