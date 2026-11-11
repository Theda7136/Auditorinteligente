(function () {
    const engine = window.AuditEngine;
    const STORAGE_KEY_HISTORY = 'gemini_contract_audit_history';
    const STORAGE_KEY_MODEL = 'gemini_selected_model';
    const STORAGE_KEY_PREFS = 'auditor_review_prefs';
    const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

    let currentAnalysis = null;
    let clearArmed = false;
    let currentUser = null;
    let serverHistory = [];
    let csrfTokenValue = '';

    const $ = function (id) { return document.getElementById(id); };

    function showNotice(message, tone) {
        const notice = $('appNotice');
        if (!message) {
            notice.hidden = true;
            notice.textContent = '';
            return;
        }
        notice.hidden = false;
        notice.className = 'notice ' + (tone || 'info');
        notice.textContent = message;
    }

    function setGeminiRetry(error) {
        const panel = $('geminiRetryPanel');
        if (!panel) return;
        const retryable = error && !['MODEL', 'RATE', 'QUOTA', 'AUTH'].includes(error.code);
        panel.hidden = !retryable;
        if (!retryable) return;
        const unavailable = error.diagnostic?.httpStatus === 503;
        $('geminiRetryDescription').textContent = unavailable
            ? 'El servicio de IA no está disponible temporalmente. Realizamos una revisión preliminar con el sistema local.'
            : 'Realizamos una revisión preliminar con el sistema local. Puedes intentar nuevamente con IA.';
    }

    function readPrefs() {
        return {
            contractType: $('contractType').value,
            jurisdiction: $('jurisdiction').value,
            party: $('party').value,
            priorities: {
                financial: $('priorityFinancial').value,
                abusive: $('priorityAbusive').value,
                penalties: $('priorityPenalties').value,
                compliance: $('priorityCompliance').value
            },
            storeFullText: $('storeFullText').checked
        };
    }

    function savePrefs() {
        const prefs = readPrefs();
        localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
        localStorage.setItem(STORAGE_KEY_MODEL, $('modelSelect').value);
    }

    function loadPrefs() {
        let prefs = {};
        try {
            prefs = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS) || '{}');
        } catch (error) {
            prefs = {};
        }
        if (prefs.contractType) $('contractType').value = prefs.contractType;
        if (prefs.jurisdiction && engine.JURISDICTIONS[prefs.jurisdiction]) $('jurisdiction').value = prefs.jurisdiction;
        if (prefs.party) $('party').value = prefs.party;
        if (prefs.priorities) {
            $('priorityFinancial').value = prefs.priorities.financial || 'media';
            $('priorityAbusive').value = prefs.priorities.abusive || 'alta';
            $('priorityPenalties').value = prefs.priorities.penalties || 'alta';
            $('priorityCompliance').value = prefs.priorities.compliance || 'alta';
        }
        $('storeFullText').checked = Boolean(prefs.storeFullText);
    }

    let lastGeminiError = null;

    function updateConnectionBadge() {
        const configured = window.geminiAvailable === true;
        const badge = $('statusBadge');
        const label = !configured
            ? 'Revisión local disponible'
            : lastGeminiError
                ? 'Servicio de IA temporalmente no disponible'
                : 'Servicio de IA configurado · sin verificar';

        $('configStatusText').textContent = label;
        $('statusText').textContent = label;
        badge.classList.toggle('live', configured && !lastGeminiError);
    }

    function recordGeminiError(error) {
        lastGeminiError = error;
        const unavailable = error.diagnostic?.httpStatus === 503;
        const limited = error.code === 'RATE' || error.code === 'QUOTA' || error.diagnostic?.httpStatus === 429;
        $('serverStatus').textContent = unavailable
            ? 'Último análisis: proveedor no disponible (HTTP 503). Motor local disponible.'
            : limited
                ? 'Último análisis: límite de solicitudes o cuota. Revisa tu plan de Gemini.'
                : 'Último análisis: error de Gemini (' + (error.code || 'API') + '). Motor local disponible.';
        updateConnectionBadge();
    }

    function setBusy(isBusy, label) {
        $('analyzeBtn').disabled = isBusy;
        $('uploadBtn').disabled = isBusy;
        $('analyzeSpinner').classList.toggle('hidden', !isBusy);
        $('analyzeBtnText').textContent = label || 'Analizar contrato';
    }

    function updateDocumentLength() {
        const counter = $('contractCharacterCount');
        if (!counter) return;
        const length = $('contractText').value.length;
        counter.textContent = new Intl.NumberFormat('es-CO').format(length) + ' caracteres';
    }

    function renderDashboard(data) {
        currentAnalysis = data;
        renderHybridComparison(data?.hybridComparison);
        const modePanel = $('auditModePanel');
        const modeTitle = $('auditModeTitle');
        const modeDescription = $('auditModeDescription');

        modePanel.hidden = !data;

        if (data) {
            const isHybrid = Boolean(data.hybridComparison);

            modeTitle.textContent = 'Revisión del contrato completada';

            modeDescription.textContent = isHybrid
                ? 'Consulta los riesgos identificados y las recomendaciones para revisar las cláusulas.'
                : 'Revisión preliminar basada en reglas automatizadas. Algunos riesgos pueden requerir una evaluación profesional adicional.';
        }
        const hasResult = Boolean(data);
        $('emptyState').hidden = hasResult;
        $('resultsBody').hidden = !hasResult;
        $('exportPdfBtn').disabled = !hasResult;
        $('exportTxtBtn').disabled = !hasResult;
        if (!hasResult) return;

        const band = engine.riskBand(data.score);
        $('riskCard').dataset.band = band;
        $('riskScore').textContent = String(data.score);
        $('riskScoreBar').style.width = data.score + '%';
        $('riskLevelLabel').textContent = 'Riesgo ' + engine.riskLabel(data.score).toLowerCase();
        $('auditSourceTag').textContent = /^Gemini \(/.test(data.source || '')
            ? 'Revisión con IA'
            : 'Revisión preliminar';
        $('auditTimestampText').textContent = data.date || '';
        const details = engine.traceLines(data);
        const reviewStates = { risk: 'riesgo identificado', not_detected: 'sin riesgo detectado', uncertain: 'requiere revisión' };
        (data.coverage || []).forEach(row => details.push((engine.REVIEW_LABELS[engine.REVIEW_CATEGORIES.indexOf(row.category)] || row.category) + ': ' + (reviewStates[row.status] || row.status) + ' — ' + row.reason));
        (data.clauseReviews || []).forEach(row => details.push(row.clauseId + ': ' + (reviewStates[row.status] || row.status) + ' — ' + row.reason));
        $('analysisDetailsText').textContent = details.join('\n');
        $('contextLine').textContent = [
            data.contractType || 'Contrato',
            data.jurisdictionLabel || '',
            engine.partyLabel(data.party)
        ].filter(Boolean).join(' · ');
        $('truncationNote').hidden = !data.truncated;
        $('truncationNote').textContent = data.truncated
            ? 'El modelo solo vio los primeros ' + data.analyzedLength + ' de ' + data.originalLength + ' caracteres.'
            : '';

        const alerts = data.alerts || [];
        $('alertsCountBadge').textContent = alerts.length + (alerts.length === 1 ? ' alerta' : ' alertas');
        const container = $('alertsContainer');
        container.replaceChildren();
        updateDocumentLength();
        $('contractText').classList.remove('contract-evidence-active');
        $('selectedClauseIndicator').hidden = true;
        $('selectedClauseIndicator').textContent = '';
        alerts.forEach(function (alert) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'alert finding-card ' + (alert.level || 'medium');

            const heading = document.createElement('div');
            heading.className = 'finding-heading';

            const title = document.createElement('h3');
            title.textContent = alert.title || 'Hallazgo';
            heading.append(title);

            const severity = { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo' };
            if (alert.level) {
                const badge = document.createElement('span');
                badge.className = 'finding-severity';
                badge.textContent = severity[alert.level] || alert.level;
                heading.append(badge);
            }
            button.append(heading);

            if (alert.desc) {
                const description = document.createElement('p');
                description.className = 'finding-description';
                description.textContent = alert.desc;
                button.append(description);
            }

            const evidenceList = Array.isArray(alert.evidence) && alert.evidence.length
                ? alert.evidence
                : [{ excerpt: alert.excerpt, clauseId: alert.clauseId }];

            const evidenceQuotes = evidenceList.filter(function (evidence) {
                return typeof evidence?.excerpt === 'string' && evidence.excerpt.trim();
            });

            if (evidenceQuotes.length) {
                const preview = document.createElement('blockquote');
                preview.className = 'quote finding-quote finding-quote-preview';
                const first = evidenceQuotes[0];
                const prefix = first.clauseId ? first.clauseId + ' · ' : '';
                preview.textContent = prefix + first.excerpt;
                button.append(preview);
            }

            button.addEventListener('click', function () {
                container.querySelectorAll('.finding-card.is-selected').forEach(function (card) {
                    card.classList.remove('is-selected');
                    card.removeAttribute('aria-pressed');
                });
                button.classList.add('is-selected');
                button.setAttribute('aria-pressed', 'true');
                revealExcerpt(alert);
            });
            const entry = document.createElement('div');
            entry.className = 'finding-entry';
            entry.append(button);

            if (evidenceQuotes.length) {
                const details = document.createElement('details');
                details.className = 'finding-evidence';
                const summary = document.createElement('summary');
                summary.textContent = evidenceQuotes.length > 1 ? 'Ver citas completas (' + evidenceQuotes.length + ')' : 'Ver cita completa';
                details.append(summary);

                evidenceQuotes.forEach(function (evidence) {
                    const quote = document.createElement('blockquote');
                    quote.className = 'quote finding-quote';
                    const reference = evidence.clauseId ? evidence.clauseId + ' · ' : '';
                    const statement = evidence.statement ? evidence.statement + ' — ' : '';
                    quote.textContent = reference + statement + evidence.excerpt;
                    details.append(quote);
                });
                entry.append(details);
            }

            container.append(entry);
        });

        const list = $('recommendationsList');
        list.replaceChildren();
        (data.recommendations || []).filter(function (recommendation) {
            return typeof recommendation === 'string' && !/^Respaldo local:/i.test(recommendation);
        }).forEach(function (recommendation, index) {
            const item = document.createElement('li');
            item.className = 'recommendation-action';

            const number = document.createElement('span');
            number.className = 'recommendation-number';
            number.textContent = String(index + 1).padStart(2, '0');

            const content = document.createElement('div');
            content.className = 'recommendation-content';

            const label = document.createElement('span');
            label.className = 'recommendation-label';
            label.textContent = 'Acción sugerida';

            const description = document.createElement('p');
            description.textContent = recommendation;

            content.append(label, description);

            const linkedAlerts = alerts.filter(function (alert) {
                const suggestions = [alert.recommendation, alert.recommendedAction]
                    .concat(Array.isArray(alert.recommendations) ? alert.recommendations : []);
                return suggestions.some(function (suggestion) {
                    return typeof suggestion === 'string'
                        && suggestion.trim().toLocaleLowerCase('es') === recommendation.trim().toLocaleLowerCase('es');
                });
            });

            if (linkedAlerts.length === 1) {
                const linkedAlert = linkedAlerts[0];
                const reference = document.createElement('button');
                reference.type = 'button';
                reference.className = 'recommendation-reference';
                reference.textContent = 'Ver hallazgo relacionado';
                reference.addEventListener('click', function () {
                    const alertIndex = alerts.indexOf(linkedAlert);
                    const findingCard = container.children[alertIndex]?.querySelector('.finding-card');
                    if (!findingCard) return;
                    findingCard.click();
                    findingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                content.append(reference);
            }

            item.append(number, content);
            list.append(item);
        });
    }

    function renderHybridComparison(comparison) {
        const panel = $('hybridPanel');
        const summary = $('hybridSummary');
        const container = $('hybridFindings');

        if (!panel || !summary || !container) return;

        panel.hidden = !comparison;
        container.replaceChildren();
        const tabs = $('hybridTabs');
        if (tabs) tabs.replaceChildren();
        if (!comparison) return;

        const agreements = comparison.agreements || [];
        const localOnly = comparison.localOnly || [];
        const geminiOnly = comparison.geminiOnly || [];

        summary.textContent = 'Resultados comparados por origen. Selecciona una categoría para revisar sus hallazgos.';
        const groups = [];
        let activeTone = 'agreement';

        function selectGroup(tone) {
            activeTone = tone;
            for (const entry of groups) {
                entry.group.hidden = entry.tone !== tone;
                entry.tab.setAttribute('aria-selected', String(entry.tone === tone));
                entry.tab.tabIndex = entry.tone === tone ? 0 : -1;
            }
        }

        function addGroup(label, findings, tone, getFinding) {
            const group = document.createElement('section');
            group.className = 'hybrid-group';

            const heading = document.createElement('h4');
            heading.className = 'hybrid-group-title';
            heading.textContent = `${label} (${findings.length})`;
            group.append(heading);

            findings.forEach(function (entry) {
                const finding = getFinding(entry);
                const card = document.createElement('button');
                card.type = 'button';
                card.className = `hybrid-finding hybrid-${tone}`;

                const title = document.createElement('strong');
                title.className = 'hybrid-finding-title';
                title.textContent = finding.title || finding.category || 'Hallazgo';
                card.append(title);

                const clauseIds = entry.clauseIds || finding.clauseIds || [];
                const clauseId = entry.clauseId || finding.clauseId || clauseIds.join(', ');
                const excerpt = finding.excerpt || '';

                if (clauseId) {
                    const reference = document.createElement('span');
                    reference.className = 'hybrid-finding-reference';
                    reference.textContent = clauseId;
                    card.append(reference);
                }

                if (excerpt) {
                    card.title = 'Localizar la cita en el contrato';
                    card.addEventListener('click', function () {
                        revealExcerpt(finding);
                    });
                } else {
                    card.disabled = true;
                }

                group.append(card);
            });

            container.append(group);
            if (tabs) {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'hybrid-tab';
                tab.setAttribute('role', 'tab');
                tab.textContent = `${label} (${findings.length})`;
                tab.addEventListener('click', function () { selectGroup(tone); });
                tabs.append(tab);
                groups.push({ tone, group, tab });
            }
            if (!findings.length) {
                const empty = document.createElement('p');
                empty.className = 'muted hybrid-empty';
                empty.textContent = 'No se encontraron hallazgos en esta categoría.';
                group.append(empty);
            }
        }

        addGroup('Coincidencias', agreements, 'agreement', function (entry) {
            return entry.gemini || entry.local || {};
        });
        addGroup('Solo motor local', localOnly, 'local', function (entry) {
            return entry;
        });
        addGroup('Solo Gemini', geminiOnly, 'gemini', function (entry) {
            return entry;
        });
        if (tabs) selectGroup(agreements.length ? 'agreement' : localOnly.length ? 'local' : 'gemini');
    }

    function installHybridStyles() {
        if (document.getElementById('hybrid-panel-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'hybrid-panel-styles';
        styles.textContent = `
            #hybridPanel { min-width: 0; }
            #hybridSummary { display: block; font-size: .88rem; line-height: 1.5; overflow-wrap: anywhere; }
            #hybridFindings { display: grid; gap: 16px; max-height: none; overflow: visible; min-width: 0; }
            #hybridPanel .hybrid-group { display: grid; gap: 9px; min-width: 0; }
            #hybridPanel .hybrid-group-title { margin: 0; font-size: .88rem; color: #334155; }
            #hybridPanel .hybrid-finding {
                display: flex; flex-direction: column; align-items: stretch; gap: 7px;
                width: 100%; min-width: 0; box-sizing: border-box;
                padding: 13px 14px; margin: 0; border: 1px solid #dbe3ee;
                border-left: 4px solid #64748b; border-radius: 10px;
                background: #f8fafc; color: #172b4d; text-align: left;
                font: inherit; line-height: 1.45; white-space: normal;
                overflow-wrap: anywhere; cursor: pointer;
            }
            #hybridPanel .hybrid-finding:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
            #hybridPanel .hybrid-finding:disabled { cursor: default; opacity: 1; }
            #hybridPanel .hybrid-finding-title { display: block; font-size: .9rem; line-height: 1.4; }
            #hybridPanel .hybrid-finding-quote { display: block; font-size: .82rem; color: #475569; }
            #hybridPanel .hybrid-agreement { border-left-color: #0f766e; background: #f0fdfa; }
            #hybridPanel .hybrid-local { border-left-color: #b45309; background: #fffbeb; }
            #hybridPanel .hybrid-gemini { border-left-color: #4f46e5; background: #eef2ff; }
        `;
        document.head.append(styles);
    }

    function revealExcerpt(alert) {
        const area = $('contractText');
        const indicator = $('selectedClauseIndicator');
        const evidence = Array.isArray(alert.evidence) ? alert.evidence : [];
        const clauseId = alert.clauseId || evidence.find(function (entry) {
            return typeof entry?.clauseId === 'string' && entry.clauseId.trim();
        })?.clauseId;
        const candidates = [alert.anchor, alert.excerpt].concat(
            evidence.map(function (entry) { return entry?.excerpt; })
        ).filter(Boolean);
        for (let i = 0; i < candidates.length; i += 1) {
            const needle = String(candidates[i]).replace(/^[.…\s]+|[.…\s]+$/g, '').slice(0, 80);
            if (!needle) continue;
            const index = area.value.toLowerCase().indexOf(needle.toLowerCase());
            if (index >= 0) {
                area.focus();
                area.setSelectionRange(index, index + needle.length);
                area.classList.add('contract-evidence-active');
                indicator.textContent = clauseId
                    ? 'Evidencia localizada · ' + clauseId
                    : 'Evidencia localizada en el documento';
                indicator.hidden = false;
                showNotice('');
                return;
            }
        }
        indicator.textContent = 'Cita no localizada en el texto';
        indicator.hidden = false;
        showNotice('No encontré esa cita dentro del texto cargado.', 'info');
    }

    function stamp(result, source, prefs, extra) {
        const law = engine.JURISDICTIONS[prefs.jurisdiction] || engine.JURISDICTIONS.OTRO;
        result.source = source;
        result.contractType = prefs.contractType;
        result.jurisdiction = prefs.jurisdiction;
        result.jurisdictionLabel = law.label;
        result.party = prefs.party;
        result.date = new Date().toLocaleString();
        result.truncated = Boolean(extra && extra.truncated);
        result.originalLength = extra && extra.originalLength;
        result.analyzedLength = extra && extra.analyzedLength;
        return result;
    }

    function askConsent() {
        if (sessionStorage.getItem('auditor_gemini_consent') === '1') return Promise.resolve(true);
        const dialog = $('consentDialog');
        return new Promise(function (resolve) {
            const accept = $('consentAccept');
            const decline = $('consentDecline');
            function finish(allowed) {
                accept.removeEventListener('click', onAccept);
                decline.removeEventListener('click', onDecline);
                dialog.removeEventListener('cancel', onDecline);
                dialog.close();
                resolve(allowed);
            }
            function onAccept() {
                sessionStorage.setItem('auditor_gemini_consent', '1');
                finish(true);
            }
            function onDecline(event) {
                if (event) event.preventDefault();
                finish(false);
            }
            accept.addEventListener('click', onAccept);
            decline.addEventListener('click', onDecline);
            dialog.addEventListener('cancel', onDecline);
            dialog.showModal();
        });
    }

    function delay(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function checkServerStatus() {
        try {
            const response = await fetch('/api/health');
            const status = await response.json();
            window.geminiAvailable = response.ok && status.gemini === true;
            $('serverStatus').textContent = window.geminiAvailable
                ? lastGeminiError
                    ? 'Gemini configurado; último intento fallido. Actualizar estado no prueba el proveedor.'
                    : 'API configurada en el servidor. Disponibilidad de Gemini sin verificar.'
                : 'Gemini no configurado; análisis local disponible';
        } catch (error) {
            window.geminiAvailable = false;
            $('serverStatus').textContent = 'Servidor API no disponible; análisis local disponible';
        }
        updateConnectionBadge();
    }

    async function callGemini(options) {
        let response;
        for (let attempt = 0; attempt < 1; attempt += 1) {
            try {
                response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(options)
                });
            } catch (networkError) {
                const error = new Error('No hubo conexión con el servidor. Se usó el motor local.');
                error.code = 'NETWORK';
                throw error;
            }
            if (response.status !== 429 || attempt === 2) break;
            await delay(700 * (attempt + 1));
        }

        const payload = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            const message = payload.error || 'El servidor respondió con HTTP ' + response.status + '.';
            const error = new Error(message);
            error.code = payload.code || (response.status === 429 ? 'RATE' : 'API');
            error.diagnostic = payload.diagnostic;
            throw error;
        }
        return Object.assign({}, payload.analysis, {
            provenance: payload.provenance,
            hybridComparison: payload.hybridComparison || null
        });
    }

    function readHistory() {
        if (currentUser) return serverHistory;
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function persistHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
            return { ok: true, droppedText: false };
        } catch (error) {
            try {
                localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.map(engine.withoutFullText)));
                return { ok: true, droppedText: true };
            } catch (secondError) {
                return { ok: false, droppedText: false };
            }
        }
    }

    function renderHistory() {
        const history = readHistory();
        $('historyCountBadge').textContent = String(history.length);
        const list = $('historyList');
        list.replaceChildren();
        if (!history.length) {
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = 'Todavía no hay auditorías en este navegador.';
            list.append(empty);
            return;
        }
        history.forEach(function (item) {
            const row = document.createElement('div');
            row.className = 'history-item';
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'history-open';
            const text = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = item.title || 'Contrato';
            const meta = document.createElement('span');
            meta.className = 'muted';
            meta.textContent = (item.date || '') + (item.textStored ? '' : ' · sin texto completo');
            text.append(title, document.createElement('br'), meta);
            const pill = document.createElement('span');
            pill.className = 'score-pill ' + engine.riskBand(item.score || 0);
            pill.textContent = (item.score ?? '–') + '/100';
            open.append(text, pill);
            open.addEventListener('click', function () { loadAudit(item.id); });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn tiny ghost danger';
            remove.textContent = 'Borrar';
            remove.addEventListener('click', function () { deleteAudit(item.id); });
            row.append(open, remove);
            list.append(row);
        });
    }

    function loadAudit(id) {
        const item = readHistory().find(function (entry) { return entry.id === id; });
        if (!item || !item.data) return;
        if (item.fullText) {
            $('contractText').value = item.fullText;
            showNotice('');
        } else {
            $('contractText').value = item.excerpt || '';
            showNotice('Esta entrada no guardó el contrato completo. El dictamen se restauró con el extracto disponible.', 'info');
        }
        if (item.data.contractType) $('contractType').value = item.data.contractType;
        if (item.data.jurisdiction) $('jurisdiction').value = item.data.jurisdiction;
        if (item.data.party) $('party').value = item.data.party;
        renderDashboard(item.data);
    }

    async function deleteAudit(id) {
        if (currentUser) {
            const response = await fetch('/api/history/' + encodeURIComponent(id), {
                method: 'DELETE', headers: { 'X-CSRF-Token': csrfTokenValue }
            });
            if (!response.ok) { showNotice('No se pudo borrar el análisis de tu cuenta.', 'bad'); return; }
            await refreshServerHistory();
            return;
        }
        persistHistory(readHistory().filter(function (entry) { return entry.id !== id; }));
        renderHistory();
    }

    async function saveAnalysis(fullText, data) {
        const prefs = readPrefs();
        const record = engine.createHistoryRecord({
            title: fullText.split('\n')[0] || 'Contrato',
            fullText: fullText,
            data: data,
            storeFullText: prefs.storeFullText
        });
        if (currentUser) {
            const response = await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokenValue },
                body: JSON.stringify({ title: record.title, excerpt: record.excerpt, data: record.data })
            });
            if (!response.ok) {
                showNotice('El análisis terminó, pero no se pudo guardar en tu cuenta.', 'warn');
                return;
            }
            await refreshServerHistory();
            return;
        }
        const saved = persistHistory(engine.pushHistory(readHistory(), record));
        renderHistory();
        if (!saved.ok) {
            showNotice('No se pudo guardar el historial: el almacenamiento del navegador está lleno.', 'bad');
        } else if (saved.droppedText) {
            showNotice('El historial se guardó sin el texto completo porque no cabía en el almacenamiento local.', 'warn');
        }
    }

    async function analyzeContract() {
        const fullText = $('contractText').value.trim();
        if (!fullText) {
            showNotice('Pega un contrato o carga un archivo antes de analizar.', 'warn');
            return;
        }
        const prefs = readPrefs();
        savePrefs();
        $('analyzeBtn').disabled = true;
        $('uploadBtn').disabled = true;
        showNotice('');
        setGeminiRetry(null);

        try {
            let result = null;
            let source = 'Simulación heurística local';
            let extra = null;
            let useGemini = false;
            if (window.geminiAvailable) {
                useGemini = await askConsent();
                if (!useGemini) {
                    showNotice('No se envió el contrato. El dictamen es solo del motor local.', 'info');
                }
            }
            setBusy(true, useGemini ? 'Auditando…' : 'Revisando en local…');
            if (useGemini) {
                const request = engine.buildGeminiRequest({
                    model: $('modelSelect').value,
                    contractText: fullText,
                    contractType: prefs.contractType,
                    jurisdiction: prefs.jurisdiction,
                    party: prefs.party,
                    priorities: prefs.priorities
                });
                extra = request;
                if (request.truncated) {
                    showNotice('El documento supera ' + engine.MAX_GEMINI_CHARS + ' caracteres. Gemini solo recibió el inicio.', 'warn');
                }
                try {
                    result = await callGemini({
                        model: request.model,
                        contractText: fullText,
                        contractType: prefs.contractType,
                        jurisdiction: prefs.jurisdiction,
                        party: prefs.party,
                        priorities: prefs.priorities
                    });
                    source = 'Gemini (' + request.model + ')';
                    lastGeminiError = null;
                    setGeminiRetry(null);
                    $('serverStatus').textContent = 'Último análisis con Gemini: completado correctamente.';
                    updateConnectionBadge();
                } catch (error) {
                    recordGeminiError(error);
                    setGeminiRetry(error);
                    if (['MODEL', 'RATE', 'QUOTA', 'AUTH'].includes(error.code)) {
                        showNotice(error.message, 'bad');
                        return;
                    }
                    result = engine.runLocalSimulation(fullText, prefs);
                    source = 'Simulación local (respaldo)';
                    result.provenance = { ...result.provenance, attemptedModel: request.model, fallbackReason: error.code || 'UNKNOWN', diagnostic: error.diagnostic };
                    if (!['MODEL', 'RATE', 'QUOTA', 'AUTH'].includes(error.code)) {
                        showNotice('');
                    } else {
                        showNotice(error.message, 'warn');
                    }
                }
            } else {
                result = engine.runLocalSimulation(fullText, prefs);
            }
            stamp(result, source, prefs, source.indexOf('Gemini (') === 0 ? extra : null);
            renderDashboard(result);
            try { await saveAnalysis(fullText, result); } catch (saveError) { showNotice('El análisis terminó, pero no se pudo guardar el historial. Puedes exportarlo ahora.', 'warn'); }
        } finally {
            setBusy(false);
        }
    }

    async function refreshCsrfToken() {
        const response = await fetch('/api/auth/csrf');
        if (!response.ok) throw new Error('No se pudo iniciar la protección de sesión.');
        const payload = await response.json();
        csrfTokenValue = payload.csrfToken;
    }

    async function refreshServerHistory() {
        const response = await fetch('/api/history');
        if (!response.ok) throw new Error('No se pudo cargar el historial de la cuenta.');
        const payload = await response.json();
        serverHistory = Array.isArray(payload.history) ? payload.history : [];
        renderHistory();
    }

    function updateAccountView() {
        $('authForms').hidden = Boolean(currentUser);
        $('accountSession').hidden = !currentUser;
        $('accountStatus').textContent = currentUser ? 'Cuenta activa' : 'Modo invitado';
        $('accountEmail').textContent = currentUser ? currentUser.email : '';
        $('authMessage').textContent = currentUser
            ? 'Tu historial está asociado a esta cuenta. Los contratos completos no se guardan en el servidor.'
            : 'Puedes analizar sin cuenta. Inicia sesión para guardar tu historial de forma privada en este servidor.';
        renderHistory();
    }

    async function initializeAuth() {
        try {
            await refreshCsrfToken();
            const response = await fetch('/api/auth/me');
            const payload = await response.json();
            currentUser = payload.authenticated ? payload.user : null;
            if (currentUser) await refreshServerHistory();
        } catch (error) {
            $('authMessage').textContent = 'No se pudo comprobar la sesión. Puedes seguir usando el análisis local.';
        }
        updateAccountView();
    }

    async function submitAuth(action) {
        const email = $('authEmail').value.trim();
        const password = $('authPassword').value;
        if (!email || !password) {
            $('authMessage').textContent = 'Completa el correo y la contraseña.';
            return;
        }
        try {
            if (!csrfTokenValue) await refreshCsrfToken();
            const response = await fetch('/api/auth/' + action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfTokenValue },
                body: JSON.stringify({ email, password })
            });
            const payload = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
            currentUser = payload.user;
            await refreshCsrfToken();
            $('authPassword').value = '';
            await refreshServerHistory();
            updateAccountView();
        } catch (error) {
            $('authMessage').textContent = error.message;
        }
    }

    async function logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST', headers: { 'X-CSRF-Token': csrfTokenValue }
            });
            if (!response.ok) throw new Error('No se pudo cerrar la sesión.');
            currentUser = null;
            serverHistory = [];
            csrfTokenValue = '';
            await refreshCsrfToken();
            updateAccountView();
        } catch (error) {
            $('authMessage').textContent = error.message;
        }
    }

    function pdfSafe(text) {
        return String(text || '').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    }

    function exportTxt() {
        if (!currentAnalysis) return;
        const blob = new Blob([engine.buildReportText(currentAnalysis)], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'dictamen-' + new Date().toISOString().slice(0, 10) + '.txt';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function exportPdf() {
        if (!currentAnalysis) return;
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showNotice('No se cargó el generador de PDF. Revisa la conexión e inténtalo de nuevo.', 'bad');
            return;
        }
        const data = currentAnalysis;
        const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 18;
        const width = pageWidth - margin * 2;
        let y = 20;

        function addParagraph(text, options) {
            const settings = options || {};
            const size = settings.size || 10;
            doc.setFont('helvetica', settings.bold ? 'bold' : 'normal');
            doc.setFontSize(size);
            doc.setTextColor.apply(doc, settings.color || [51, 65, 85]);
            const lines = doc.splitTextToSize(pdfSafe(text), width);
            const lineHeight = size * 0.48;
            if (settings.keepNext && y + lines.length * lineHeight + settings.keepNext > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            lines.forEach(function (line) {
                if (y + lineHeight > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
                doc.text(line, margin, y);
                y += lineHeight;
            });
            y += settings.gap == null ? 2 : settings.gap;
        }

        doc.setFillColor(23, 43, 77);
        doc.rect(0, 0, pageWidth, 36, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('DICTAMEN DE REVISION CONTRACTUAL', margin, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Riesgos, citas y recomendaciones para negociar', margin, 26);
        y = 48;
        addParagraph(data.contractType + ' · ' + (data.jurisdictionLabel || '') + ' · ' + engine.partyLabel(data.party), { bold: true, size: 11, color: [23, 43, 77] });
        addParagraph((data.date || '') + '  |  ' + (data.source || ''));
        addParagraph('Evaluacion: ' + data.score + ' / 100 — ' + engine.riskLabel(data.score), { bold: true, size: 12, color: data.score >= 70 ? [180, 35, 24] : [23, 43, 77], gap: 6 });
        if (data.truncated) {
            addParagraph('El modelo solo reviso ' + data.analyzedLength + ' de ' + data.originalLength + ' caracteres.', { gap: 4 });
        }
        engine.traceLines(data).forEach(function (line) { addParagraph(line, { size: 8 }); });
        addParagraph('HALLAZGOS', { bold: true, size: 12, color: [23, 43, 77], gap: 3, keepNext: 24 });
        (data.alerts || []).forEach(function (alert, index) {
            addParagraph((index + 1) + '. ' + alert.title + ' [' + String(alert.level || '').toUpperCase() + ']', { bold: true, gap: 1, keepNext: 10 });
            addParagraph(alert.desc || '', { size: 9, gap: 1 });
            (alert.evidence || [{ excerpt: alert.excerpt }]).forEach(function (evidence) {
                addParagraph((evidence.clauseId ? evidence.clauseId + ' · ' : '') + (evidence.statement ? evidence.statement + ' — ' : '') + 'Cita: ' + (evidence.excerpt || 'Sin cita textual'), { size: 9, gap: 3 });
            });
        });
        addParagraph('RECOMENDACIONES', { bold: true, size: 12, color: [23, 43, 77], gap: 3, keepNext: 12 });
        (data.recommendations || []).forEach(function (item, index) {
            addParagraph((index + 1) + '. ' + item, { size: 9, gap: 2 });
        });
        addParagraph('Este informe no reemplaza el criterio de un abogado.', { size: 8, gap: 2 });

        const pages = doc.internal.getNumberOfPages();
        for (let page = 1; page <= pages; page += 1) {
            doc.setPage(page);
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text('Confidencial', margin, pageHeight - 8);
            doc.text(page + ' / ' + pages, pageWidth - margin, pageHeight - 8, { align: 'right' });
        }
        doc.save('dictamen-' + new Date().toISOString().slice(0, 10) + '.pdf');
    }

    function readFile(file) {
        const extension = (file.name.split('.').pop() || '').toLowerCase();
        if (extension === 'doc') {
            showNotice('Los archivos .doc antiguos no se pueden leer en el navegador. Guárdalo como .docx o PDF.', 'warn');
            return;
        }
        setBusy(true, 'Leyendo archivo…');
        const reader = new FileReader();
        reader.onerror = function () {
            setBusy(false);
            showNotice('No se pudo leer el archivo.', 'bad');
        };
        if (extension === 'pdf') {
            reader.onload = async function () {
                try {
                    if (!window.pdfjsLib) throw new Error('PDF.js no está disponible.');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
                    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(reader.result) }).promise;
                    let text = '';
                    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                        const page = await pdf.getPage(pageNumber);
                        const content = await page.getTextContent();
                        text += content.items.map(function (item) { return item.str; }).join(' ') + '\n\n';
                    }
                    $('contractText').value = text.trim();
                    setBusy(false);
                    analyzeContract();
                } catch (error) {
                    setBusy(false);
                    showNotice('No se pudo extraer el texto del PDF. Si es un escaneo, hace falta pegar el texto. ' + error.message, 'bad');
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }
        if (extension === 'docx') {
            reader.onload = async function () {
                try {
                    if (!window.mammoth) throw new Error('Mammoth no está disponible.');
                    const result = await mammoth.extractRawText({ arrayBuffer: reader.result });
                    $('contractText').value = (result.value || '').trim();
                    setBusy(false);
                    analyzeContract();
                } catch (error) {
                    setBusy(false);
                    showNotice('No se pudo leer el DOCX. ' + error.message, 'bad');
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }
        reader.onload = function () {
            $('contractText').value = String(reader.result || '').trim();
            setBusy(false);
            analyzeContract();
        };
        reader.readAsText(file);
    }

    function bind() {
        engine.MODELS.forEach(function (model) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label;
            $('modelSelect').append(option);
        });
        $('modelSelect').value = engine.knownModel(localStorage.getItem(STORAGE_KEY_MODEL));
        loadPrefs();
        updateConnectionBadge();
        renderHistory();
        installHybridStyles();
        renderDashboard(null);
        updateDocumentLength();
        $('contractText').addEventListener('input', updateDocumentLength);
        if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;

        checkServerStatus();
        $('refreshConnectionBtn')?.addEventListener('click', async function () {
            const button = $('refreshConnectionBtn');
            const statusText = $('serverStatus');

            button.disabled = true;
            button.textContent = 'Comprobando…';
            statusText.textContent = 'Consultando el estado del servidor…';

            try {
                await checkServerStatus();
                statusText.textContent +=
                    ' · Actualizado a las ' + new Date().toLocaleTimeString('es-CO');
            } finally {
                button.disabled = false;
                button.textContent = 'Actualizar estado';
            }
        });
        initializeAuth();
        $('loginBtn').addEventListener('click', function () { submitAuth('login'); });
        $('registerBtn').addEventListener('click', function () { submitAuth('register'); });
        $('logoutBtn').addEventListener('click', logout);
        ['modelSelect', 'contractType', 'jurisdiction', 'party', 'priorityFinancial', 'priorityAbusive', 'priorityPenalties', 'priorityCompliance', 'storeFullText']
            .forEach(function (id) {
                $(id).addEventListener('change', savePrefs);
            });
        $('analyzeBtn').addEventListener('click', analyzeContract);
        $('retryGeminiBtn').addEventListener('click', analyzeContract);
        $('clearTextBtn').addEventListener('click', function () {
            $('contractText').value = '';
            renderDashboard(null);
            showNotice('');
            $('contractText').focus();
        });
        $('uploadBtn').addEventListener('click', function () { $('hiddenFileInput').click(); });
        $('hiddenFileInput').addEventListener('change', function (event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (file) readFile(file);
        });
        $('exportTxtBtn').addEventListener('click', exportTxt);
        $('exportPdfBtn').addEventListener('click', exportPdf);
        $('clearHistoryBtn').addEventListener('click', function () {
            if (!clearArmed) {
                clearArmed = true;
                $('clearHistoryBtn').textContent = 'Confirmar borrado';
                setTimeout(function () {
                    clearArmed = false;
                    $('clearHistoryBtn').textContent = 'Limpiar historial';
                }, 4000);
                return;
            }
            clearArmed = false;
            $('clearHistoryBtn').textContent = 'Limpiar historial';
            if (currentUser) {
                fetch('/api/history', { method: 'DELETE', headers: { 'X-CSRF-Token': csrfTokenValue } })
                    .then(function (response) { if (!response.ok) throw new Error(); return refreshServerHistory(); })
                    .catch(function () { showNotice('No se pudo limpiar el historial de tu cuenta.', 'bad'); });
            } else {
                localStorage.removeItem(STORAGE_KEY_HISTORY);
                renderHistory();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', bind);
})();