// Player (phone) controller logic
(function() {
    const params = new URLSearchParams(location.search);
    const gameID = params.get('game');
    let playerID = localStorage.getItem('citadels_player_id');
    let playerName = localStorage.getItem('citadels_player_name') || '';
    let state = null;
    let lobbyState = null;
    let ws = null;
    let joined = false;

    if (!gameID) {
        document.body.innerHTML = '<div class="container"><h1>' + t('no_game_id') + '</h1></div>';
        return;
    }

    // If no playerID, generate one
    if (!playerID) {
        playerID = 'p_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('citadels_player_id', playerID);
    }

    function connectWS() {
        const wsUrl = `ws://${location.host}/ws?game=${gameID}&player=${playerID}&type=player`;
        ws = new WS(wsUrl,
            (env) => {
                if (env.type === 'lobby_update') { lobbyState = env.payload; render(); }
                else if (env.type === 'player_state') { state = env.payload; render(); }
                else if (env.type === 'error') showError(env.payload.message);
                else if (env.type === 'event') console.log('Event:', env.payload);
            },
            () => { if (joined) rejoin(); },
            () => {}
        );
    }

    function rejoin() {
        ws.send('join', { player_id: playerID, name: playerName });
    }

    function render() {
        const app = document.getElementById('player-app');
        if (!joined) { renderJoinForm(app); return; }
        if (lobbyState && !lobbyState.started && !state) { renderLobby(app); return; }
        if (state) { renderGameState(app); return; }
        renderLobby(app);
    }

    function renderJoinForm(app) {
        app.innerHTML = `
            <div style="padding:40px 16px;text-align:center;">
                <h1 style="margin-bottom:24px;">${t('citadels')}</h1>
                ${langSwitcherHTML()}
                <p style="color:#888;margin-bottom:24px;">${t('game_label')}: ${gameID}</p>
                <input id="name-input" type="text" placeholder="${t('your_name')}" value="${playerName}"
                    style="width:100%;max-width:300px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">
                <button id="join-btn">${t('join_game')}</button>
            </div>
        `;
        document.getElementById('join-btn').onclick = () => {
            const name = document.getElementById('name-input').value.trim();
            if (!name) return;
            playerName = name;
            localStorage.setItem('citadels_player_name', name);
            joined = true;
            ws.send('join', { player_id: playerID, name: playerName });
            render();
        };
        bindLangSwitcher(render);
    }

    function renderLobby(app) {
        const players = lobbyState ? lobbyState.players || [] : [];
        const me = players.find(p => p.id === playerID);
        const amReady = me ? me.ready : false;
        app.innerHTML = `
            <div style="padding:20px;text-align:center;">
                ${langSwitcherHTML()}
                <h2>${t('waiting_for_players')}</h2>
                <div style="margin:20px 0;">
                    ${players.map(p => `<div class="card" style="display:inline-block;margin:4px;">
                        ${p.name} ${p.ready ? '✓' : ''}
                    </div>`).join('')}
                </div>
                <button id="ready-btn">${amReady ? t('not_ready') : t('ready')}</button>
                ${players.length >= 2 ? '<br><button id="start-btn" style="margin-top:12px;">' + t('start_game') + '</button>' : ''}
            </div>
        `;
        document.getElementById('ready-btn').onclick = () => {
            ws.send('ready', { ready: !amReady });
        };
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.onclick = () => ws.send('start_game', {});
        }
        bindLangSwitcher(render);
    }

    function renderGameState(app) {
        if (!state) return;

        if (state.phase === 'GameOver') { renderGameOver(app); return; }

        const me = (state.players || []).find(p => p.id === playerID);
        const gold = me ? me.gold : 0;
        const handSize = state.hand ? state.hand.length : 0;

        let content = `
            <div class="player-header">
                <div class="name">${playerName}</div>
                ${langSwitcherHTML()}
                <div class="info">
                    <span class="gold">${gold} ${t('gold')}</span>
                    <span>${handSize} ${t('cards')}</span>
                </div>
            </div>
        `;

        // Characters
        if (state.characters && state.characters.length > 0) {
            content += `<div class="section">
                <div class="section-title">${t('your_characters')}</div>
                <div style="color:#9b59b6;font-size:18px;">${state.characters.map(c => t(c)).join(', ')}</div>
            </div>`;
        }

        // Draft phase
        if (state.phase === 'DraftPick' && state.draft_choices && state.draft_choices.length > 0) {
            content += `<div class="section">
                <div class="section-title">${t('choose_character')}</div>
                <div class="draft-choices">
                    ${state.draft_choices.map((c, i) => `<div class="draft-choice" data-role="${i}">${t(c)}</div>`).join('')}
                </div>
            </div>`;
        } else if (state.phase === 'DraftPick') {
            content += `<div class="waiting">${t('waiting_for_pick')}</div>`;
        }

        // Draw choice
        if (state.phase === 'DrawChoice' && state.drawn_cards) {
            content += `<div class="section">
                <div class="section-title">${t('choose_card_keep')}</div>
                <div class="draw-choices">
                    ${state.drawn_cards.map((d, i) => `
                        <div class="draw-card ${colorClass(d.color)}" data-idx="${i}">
                            <div><span>${t(d.name)} <small style="color:#888">${colorLabel(d.color)}</small></span>
                            ${districtEffect(d.name) ? `<div class="card-effect">${districtEffect(d.name)}</div>` : ''}</div>
                            <span class="cost">${d.cost} ${t('gold')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // Player turn
        if (state.is_my_turn && state.phase === 'PlayerTurn') {
            content += `<div class="turn-indicator">${t('your_turn')} (${t(state.current_role)})</div>`;

            // Action buttons
            content += '<div class="action-buttons">';
            if (state.can_take_action) {
                content += `<button id="btn-gold">${t('take_2_gold')}</button>`;
                content += `<button id="btn-draw">${t('draw_cards')}</button>`;
            }
            if (state.can_use_ability && state.valid_targets && state.valid_targets.length > 0) {
                content += `<button id="btn-ability">${t('use_ability')}</button>`;
            }
            content += `<button id="btn-end">${t('end_turn')}</button>`;
            content += '</div>';

            // Ability targets
            if (state.can_use_ability && state.valid_targets) {
                content += `<div class="ability-section hidden" id="ability-targets">
                    <div class="section-title">${t('choose_target')}</div>
                    <div class="target-list">
                        ${state.valid_targets.map(tgt => `<div class="target-option" data-target="${tgt}">${translateTarget(tgt)}</div>`).join('')}
                    </div>
                </div>`;
            }

            // Hand (buildable)
            if (state.can_build && state.hand && state.hand.length > 0) {
                content += `<div class="section">
                    <div class="section-title">${t('build_district')}</div>
                    <div class="hand-cards">
                        ${state.hand.map(d => `
                            <div class="hand-card buildable ${colorClass(d.color)}" data-name="${d.name}">
                                <div><span>${t(d.name)} <small style="color:#888">${colorLabel(d.color)}</small></span>
                                ${districtEffect(d.name) ? `<div class="card-effect">${districtEffect(d.name)}</div>` : ''}</div>
                                <span class="cost">${d.cost} ${t('gold')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
        } else if (state.phase === 'PlayerTurn' && !state.is_my_turn) {
            content += `<div class="waiting">${t('waiting')} ${state.current_role ? t(state.current_role) : ''} ${t('waiting_playing')}</div>`;
        }

        // Hand (non-turn view)
        if (!(state.is_my_turn && state.phase === 'PlayerTurn' && state.can_build)) {
            if (state.hand && state.hand.length > 0) {
                content += `<div class="section">
                    <div class="section-title">${t('hand')}</div>
                    <div class="hand-cards">
                        ${state.hand.map(d => `
                            <div class="hand-card ${colorClass(d.color)}">
                                <div><span>${t(d.name)} <small style="color:#888">${colorLabel(d.color)}</small></span>
                                ${districtEffect(d.name) ? `<div class="card-effect">${districtEffect(d.name)}</div>` : ''}</div>
                                <span class="cost">${d.cost} ${t('gold')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
        }

        // City
        const city = me ? me.city || [] : [];
        if (city.length > 0) {
            content += `<div class="section">
                <div class="section-title">${t('city')} (${city.length})</div>
                <div class="city-cards">
                    ${city.map(d => `<span class="city-card ${colorClass(d.color)}" ${districtEffect(d.name) ? `title="${districtEffect(d.name)}"` : ''}>${t(d.name)} (${d.cost})</span>`).join('')}
                </div>
            </div>`;
        }

        app.innerHTML = content;
        bindActions();
        bindLangSwitcher(render);
    }

    function bindActions() {
        // Draft pick
        document.querySelectorAll('.draft-choice').forEach(el => {
            el.onclick = () => {
                const roleIdx = parseInt(el.dataset.role);
                const roleName = state.draft_choices[roleIdx];
                const roleNum = roleNameToNum(roleName);
                ws.send('draft_pick', { character: roleNum });
            };
        });

        // Draw choice
        document.querySelectorAll('.draw-card').forEach(el => {
            el.onclick = () => {
                ws.send('keep_card', { index: parseInt(el.dataset.idx) });
            };
        });

        // Action buttons
        const btnGold = document.getElementById('btn-gold');
        if (btnGold) btnGold.onclick = () => ws.send('take_gold', {});

        const btnDraw = document.getElementById('btn-draw');
        if (btnDraw) btnDraw.onclick = () => ws.send('draw_cards', {});

        const btnEnd = document.getElementById('btn-end');
        if (btnEnd) btnEnd.onclick = () => ws.send('end_turn', {});

        const btnAbility = document.getElementById('btn-ability');
        if (btnAbility) {
            btnAbility.onclick = () => {
                const targets = document.getElementById('ability-targets');
                if (targets) targets.classList.toggle('hidden');
            };
        }

        // Ability targets
        document.querySelectorAll('.target-option').forEach(el => {
            el.onclick = () => {
                const target = el.dataset.target;
                // Determine ability type based on current role
                const role = state.current_role;
                if (role === 'Assassin') {
                    ws.send('ability', { character: roleNameToNum(target) });
                } else if (role === 'Thief') {
                    ws.send('ability', { character: roleNameToNum(target) });
                } else if (role === 'Magician') {
                    if (target === 'swap_hand' || target === 'discard_draw') {
                        if (target === 'swap_hand') {
                            const others = (state.players || []).filter(p => p.id !== playerID);
                            if (others.length > 0) {
                                ws.send('ability', { extra_data: 'swap_hand', target: others[0].id });
                            }
                        } else {
                            ws.send('ability', { extra_data: 'discard_draw', indices: [0] });
                        }
                    }
                } else if (role === 'Warlord') {
                    // target format: "playerID:districtName"
                    const parts = target.split(':');
                    if (parts.length === 2) {
                        ws.send('ability', { target: parts[0], district_name: parts[1] });
                    }
                }
            };
        });

        // Build
        document.querySelectorAll('.hand-card.buildable').forEach(el => {
            el.onclick = () => {
                ws.send('build', { district_name: el.dataset.name });
            };
        });
    }

    function renderGameOver(app) {
        const scores = state.scores || [];
        scores.sort((a, b) => b.total - a.total);
        app.innerHTML = `
            <div style="text-align:center;padding:20px;">
                ${langSwitcherHTML()}
                <h1>${t('game_over')}</h1>
                <div class="scores-section">
                    ${scores.map((s, i) => `
                        <div class="score-row ${i === 0 ? 'winner' : ''}">
                            <span>${i === 0 ? '🏆 ' : ''}${s.player_name}</span>
                            <span>${s.total} ${t('pts')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        bindLangSwitcher(render);
    }

    function showError(msg) {
        console.error('Server error:', msg);
    }

    function colorLabel(color) {
        const names = { 1: 'Noble', 2: 'Religious', 3: 'Trade', 4: 'Military', 5: 'Special' };
        const key = names[color] || color || '';
        return key ? t(key) : '';
    }

    function translateTarget(target) {
        // Targets can be character names, "swap_hand", "discard_draw", or "playerID:districtName"
        if (target.includes(':')) {
            const parts = target.split(':');
            return parts[0] + ':' + t(parts[1]);
        }
        return t(target);
    }

    function roleNameToNum(name) {
        const map = { Assassin: 1, Thief: 2, Magician: 3, King: 4, Bishop: 5, Merchant: 6, Architect: 7, Warlord: 8 };
        return map[name] || 0;
    }

    connectWS();
    render();
})();
