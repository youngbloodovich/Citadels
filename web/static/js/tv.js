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
                <p style="font-size:16px;color:#888;margin-top:8px;">${t('game_label')}: ${gameID}</p>
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
        const colorMap = { Noble: 'color-noble', Religious: 'color-religious', Trade: 'color-trade', Military: 'color-military', Special: 'color-special' };
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
                    ${(p.city || []).map(d => `<span class="district-chip ${colorMap[d.color] || ''}">${t(d.name)} (${d.cost})</span>`).join('')}
                </div>
            </div>
        `;
    }

    function renderGameOver(app) {
        const scores = state.scores || [];
        scores.sort((a, b) => b.total - a.total);
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
                    ${scores.map(s => `
                        <tr>
                            <td>${s.player_name}</td>
                            <td>${s.district_score}</td>
                            <td>${s.color_bonus}</td>
                            <td>${s.first_complete + s.other_complete}</td>
                            <td>${s.special_bonus}</td>
                            <td><strong>${s.total}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
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
                return { text: t('ev_cards_drawn', { player: pName(ev.player) }), css: 'ev-action' };
            case 'district_built':
                return { text: t('ev_district_built', { player: pName(ev.player), district: t(d.district), cost: d.cost }), css: 'ev-build' };
            case 'ability_used':
                return { text: t('ev_ability_used', { player: pName(ev.player), ability: t(d.ability) }), css: 'ev-ability' };
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
