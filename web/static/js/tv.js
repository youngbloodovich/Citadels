// TV screen logic
(function() {
    const params = new URLSearchParams(location.search);
    const gameID = params.get('game');
    if (!gameID) {
        document.body.innerHTML = '<div class="container"><h1>' + t('no_game_id') + '</h1><p><a href="/api/create">Create a new game</a></p></div>';
        return;
    }

    const wsUrl = `ws://${location.host}/ws?game=${gameID}&type=tv`;
    let state = null;
    let lobbyCopied = false;
    const eventLog = [];
    const MAX_LOG = 50;

    const ws = new WS(wsUrl,
        (env) => {
            if (env.type === 'lobby_update') renderLobby(env.payload);
            else if (env.type === 'game_state') { state = env.payload; renderGame(); }
            else if (env.type === 'event') handleEvent(env.payload);
        },
        () => console.log('TV connected'),
        () => console.log('TV disconnected')
    );

    function rerender() {
        if (state) renderGame();
        else renderLobby({ players: [], started: false });
    }

    function renderLobby(data) {
        if (data.started && state) { renderGame(); return; }
        const app = document.getElementById('tv-app');
        app.innerHTML = `
            <div class="tv-header">
                <h1>${t('citadels')}</h1>
                <span class="phase-badge">${t('lobby')}</span>
                ${langSwitcherHTML()}
            </div>
            <div class="qr-section">
                <h2>${t('scan_to_join')}</h2>
                <img src="/api/qr?game=${gameID}" alt="QR Code" width="256" height="256">
                <p style="font-size:14px;color:#aaa;margin-top:8px;word-break:break-all;text-align:center;">
                    <a href="http://${location.host}/lobby.html?game=${gameID}" target="_blank" style="color:#4a90d9;text-decoration:none;">http://${location.host}/lobby.html?game=${gameID}</a>
                </p>
                <button id="copy-link-btn" style="margin-top:6px;padding:6px 18px;font-size:13px;cursor:pointer;background:#333;color:#ccc;border:1px solid #555;border-radius:6px;transition:all 0.3s;">Copy</button>
            </div>
            <div class="lobby-players">
                ${(data.players || []).map(p => `
                    <div class="lobby-player ${p.ready ? 'ready' : ''}">
                        ${p.name} ${p.ready ? '✓' : '...'}
                    </div>
                `).join('')}
            </div>
            <p style="text-align:center;color:#888;">${(data.players||[]).length} ${t('players_joined')}</p>
        `;
        bindLangSwitcher(rerender);
        const copyBtn = document.getElementById('copy-link-btn');
        const joinUrl = 'http://' + location.host + '/lobby.html?game=' + gameID;
        copyBtn.onclick = () => copyLink(joinUrl);
        if (!lobbyCopied) { lobbyCopied = true; setTimeout(() => copyLink(joinUrl), 400); }
    }

    function copyLink(url) {
        const btn = document.getElementById('copy-link-btn');
        if (!btn) return;
        // Fallback for non-secure contexts (HTTP over LAN)
        function fallbackCopy() {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        const done = () => {
            btn.textContent = 'Copied!';
            btn.style.background = '#e0a030';
            btn.style.borderColor = '#e0a030';
            btn.style.color = '#fff';
            setTimeout(() => {
                btn.textContent = 'Copy';
                btn.style.background = '#333';
                btn.style.borderColor = '#555';
                btn.style.color = '#ccc';
            }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(() => { fallbackCopy(); done(); });
        } else {
            fallbackCopy(); done();
        }
    }

    function renderGame() {
        if (!state) return;
        const app = document.getElementById('tv-app');

        if (state.phase === 'GameOver') {
            renderGameOver(app);
            return;
        }

        let draftHTML = '';
        if (state.phase === 'DraftPick') {
            draftHTML = `
                <div class="draft-info">
                    <h2>${t('draft_phase')} - ${t('round')} ${state.round}</h2>
                    ${state.draft_face_up && state.draft_face_up.length > 0 ?
                        `<div class="face-up">${t('face_up')}: ${state.draft_face_up.map(c => t(c)).join(', ')}</div>` : ''}
                    <p>${t('available_chars')}: ${state.draft_available} ${t('characters')}</p>
                    ${state.draft_picker ? `<p style="font-size:24px;margin-top:12px;">${t('picking')}: <strong>${state.draft_picker}</strong></p>` : ''}
                </div>
            `;
        }

        let callHTML = '';
        if (state.phase === 'PlayerTurn' || state.phase === 'DrawChoice' || state.phase === 'Ability') {
            callHTML = `
                <div class="call-banner">
                    ${state.current_role ? t(state.current_role) : ''} ${state.current_turn ? `- ${state.current_turn}` : ''}
                </div>
            `;
        }

        app.innerHTML = `
            <div class="tv-header">
                <h1>${t('citadels')}</h1>
                <span class="phase-badge">${t(state.phase)} - ${t('round')} ${state.round}</span>
                <span style="color:#888">${t('deck')}: ${state.deck_size}</span>
                ${langSwitcherHTML()}
            </div>
            ${draftHTML}
            ${callHTML}
            <div class="tv-body">
                <div class="players-grid">
                    ${(state.players || []).map(p => renderPlayerCard(p)).join('')}
                </div>
                <div class="event-log">
                    <div class="event-log-title">${t('event_log')}</div>
                    <div class="event-log-list" id="event-log-list">
                        ${eventLog.map(e => `<div class="event-entry ${e.css}">${e.text}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
        const logList = document.getElementById('event-log-list');
        if (logList) logList.scrollTop = logList.scrollHeight;
        bindLangSwitcher(rerender);
    }

    function renderPlayerCard(p) {
        const isActive = state.current_turn === p.name;
        return `
            <div class="player-card ${isActive ? 'active' : ''}">
                <div class="name ${p.has_crown ? 'crown' : ''}">${p.name}</div>
                <div class="stats">
                    <span class="gold">${p.gold} ${t('gold')}</span>
                    <span>${p.hand_size} ${t('cards')}</span>
                </div>
                ${p.revealed_roles && p.revealed_roles.length > 0 ?
                    `<div style="color:#9b59b6;margin:4px 0;">${p.revealed_roles.map(r => t(r)).join(', ')}</div>` : ''}
                <div class="city-districts">
                    ${(p.city || []).map(d => `<span class="district-chip ${colorClass(d.color)}" ${districtEffect(d.name) ? `title="${districtEffect(d.name)}"` : ''}>${t(d.name)} (${d.cost})${districtEffect(d.name) ? ' ✦' : ''}</span>`).join('')}
                </div>
            </div>
        `;
    }

    function renderGameOver(app) {
        const scores = state.scores || [];
        scores.sort((a, b) => b.total - a.total);
        const players = state.players || [];
        app.innerHTML = `
            <div class="tv-header">
                <h1>${t('game_over')}</h1>
                ${langSwitcherHTML()}
            </div>
            <table class="scores-table">
                <thead>
                    <tr><th>${t('player')}</th><th>${t('districts')}</th><th>${t('colors')}</th><th>${t('complete')}</th><th>${t('special')}</th><th>${t('total')}</th></tr>
                </thead>
                <tbody>
                    ${scores.map((s, i) => {
                        const player = players.find(p => p.id === s.player_id);
                        const city = player ? player.city || [] : [];
                        return `
                        <tr class="${i === 0 ? 'winner-row' : ''}">
                            <td>${s.player_name}</td>
                            <td>${s.district_score}</td>
                            <td>${s.color_bonus}</td>
                            <td>${s.first_complete + s.other_complete}</td>
                            <td>${s.special_bonus}</td>
                            <td><strong>${s.total}</strong></td>
                        </tr>
                        <tr>
                            <td colspan="6" class="score-city-row">
                                ${city.map(d => `<span class="district-chip ${colorClass(d.color)}" ${districtEffect(d.name) ? `title="${districtEffect(d.name)}"` : ''}>${t(d.name)} (${d.cost})</span>`).join('')}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            <div style="text-align:center;margin-top:20px;">
                <button onclick="location.href='/'">${t('exit_game')}</button>
            </div>
        `;
        bindLangSwitcher(rerender);
    }

    function handleEvent(ev) {
        const entry = formatEvent(ev);
        if (entry) {
            eventLog.push(entry);
            if (eventLog.length > MAX_LOG) eventLog.shift();
            renderGame();
        }
    }

    function pName(id) {
        if (!state || !state.players) return id;
        const p = state.players.find(p => p.id === id);
        return p ? p.name : id;
    }

    function formatEvent(ev) {
        const d = ev.data || {};
        switch (ev.type) {
            case 'draft_start':
                return { text: t('ev_draft_start', { round: d.round }), css: 'ev-round' };
            case 'draft_pick':
                return { text: t('ev_draft_pick', { player: pName(ev.player) }), css: 'ev-draft' };
            case 'draft_done':
                return { text: t('ev_draft_done'), css: 'ev-round' };
            case 'character_call':
                return { text: t('ev_character_call', { number: d.number, role: t(d.role) }), css: 'ev-call' };
            case 'murdered':
                return { text: t('ev_murdered', { role: t(d.role), player: pName(ev.player) }), css: 'ev-danger' };
            case 'robbed':
                return { text: t('ev_robbed', { role: t(d.role), player: pName(ev.player), stolen: d.stolen, thief: t(d.thief) }), css: 'ev-danger' };
            case 'gold_taken':
                return { text: t('ev_gold_taken', { player: pName(ev.player), gold: d.gold }), css: 'ev-action' };
            case 'cards_drawn':
                return { text: t('ev_cards_drawn', { player: pName(ev.player), count: d.count }), css: 'ev-action' };
            case 'district_built':
                return { text: t('ev_district_built', { player: pName(ev.player), district: t(d.district), cost: d.cost }), css: 'ev-build' };
            case 'ability_used': {
                const p = pName(ev.player);
                switch (d.ability) {
                    case 'assassin':
                        return { text: t('ev_assassin_kill', { player: p, role: t(d.target_role) }), css: 'ev-danger' };
                    case 'thief':
                        return { text: t('ev_thief_rob', { player: p, role: t(d.target_role) }), css: 'ev-danger' };
                    case 'magician':
                        if (d.mode === 'swap_hand')
                            return { text: t('ev_magician_swap', { player: p, target: d.target }), css: 'ev-ability' };
                        return { text: t('ev_magician_discard', { player: p, count: d.count }), css: 'ev-ability' };
                    case 'merchant':
                        return { text: t('ev_merchant_bonus', { player: p }), css: 'ev-ability' };
                    case 'architect':
                        return { text: t('ev_architect_draw', { player: p, count: d.extra_cards }), css: 'ev-ability' };
                    case 'warlord':
                        return { text: t('ev_warlord_destroy', { player: p, district: t(d.district), target: d.target, cost: d.cost }), css: 'ev-danger' };
                    case 'laboratory':
                        return { text: t('ev_lab_discard', { player: p, district: t(d.discarded) }), css: 'ev-ability' };
                    case 'smithy':
                        return { text: t('ev_smithy_draw', { player: p, count: d.cards_drawn }), css: 'ev-ability' };
                    case 'graveyard':
                        if (d.action === 'accept')
                            return { text: t('ev_graveyard_accept', { player: p, district: t(d.district) }), css: 'ev-ability' };
                        return { text: t('ev_graveyard_decline', { player: p, district: t(d.district) }), css: 'ev-ability' };
                    default:
                        return { text: p + ' used ' + d.ability, css: 'ev-ability' };
                }
            }
            case 'gold_collected':
                return { text: t('ev_gold_collected', { player: pName(ev.player), count: d.count, color: t(d.color) }), css: 'ev-action' };
            case 'crown_passed':
                return { text: t('ev_crown_passed', { player: pName(ev.player) }), css: 'ev-round' };
            case 'turn_end':
                return { text: t('ev_turn_end', { player: pName(ev.player), role: t(d.role) }), css: 'ev-minor' };
            case 'round_end':
                return { text: t('ev_round_end', { round: d.round }), css: 'ev-round' };
            case 'game_over':
                return { text: t('ev_game_over'), css: 'ev-round' };
            default:
                return null;
        }
    }

    // Initial lobby render
    renderLobby({ players: [], started: false });
})();
