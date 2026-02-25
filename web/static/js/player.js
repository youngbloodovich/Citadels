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
        document.body.innerHTML = '<div class="container"><h1>No game ID</h1></div>';
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
                <h1 style="margin-bottom:24px;">Citadels</h1>
                <p style="color:#888;margin-bottom:24px;">Game: ${gameID}</p>
                <input id="name-input" type="text" placeholder="Your name" value="${playerName}"
                    style="width:100%;max-width:300px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">
                <button id="join-btn">Join Game</button>
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
    }

    function renderLobby(app) {
        const players = lobbyState ? lobbyState.players || [] : [];
        const me = players.find(p => p.id === playerID);
        const amReady = me ? me.ready : false;
        app.innerHTML = `
            <div style="padding:20px;text-align:center;">
                <h2>Waiting for players...</h2>
                <div style="margin:20px 0;">
                    ${players.map(p => `<div class="card" style="display:inline-block;margin:4px;">
                        ${p.name} ${p.ready ? '✓' : ''}
                    </div>`).join('')}
                </div>
                <button id="ready-btn">${amReady ? 'Not Ready' : 'Ready!'}</button>
                ${players.length >= 2 ? '<br><button id="start-btn" style="margin-top:12px;">Start Game</button>' : ''}
            </div>
        `;
        document.getElementById('ready-btn').onclick = () => {
            ws.send('ready', { ready: !amReady });
        };
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.onclick = () => ws.send('start_game', {});
        }
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
                <div class="info">
                    <span class="gold">${gold} gold</span>
                    <span>${handSize} cards</span>
                </div>
            </div>
        `;

        // Characters
        if (state.characters && state.characters.length > 0) {
            content += `<div class="section">
                <div class="section-title">Your Characters</div>
                <div style="color:#9b59b6;font-size:18px;">${state.characters.join(', ')}</div>
            </div>`;
        }

        // Draft phase
        if (state.phase === 'DraftPick' && state.draft_choices && state.draft_choices.length > 0) {
            content += `<div class="section">
                <div class="section-title">Choose a character</div>
                <div class="draft-choices">
                    ${state.draft_choices.map((c, i) => `<div class="draft-choice" data-role="${i}">${c}</div>`).join('')}
                </div>
            </div>`;
        } else if (state.phase === 'DraftPick') {
            content += '<div class="waiting">Waiting for other players to pick...</div>';
        }

        // Draw choice
        if (state.phase === 'DrawChoice' && state.drawn_cards) {
            content += `<div class="section">
                <div class="section-title">Choose a card to keep</div>
                <div class="draw-choices">
                    ${state.drawn_cards.map((d, i) => `
                        <div class="draw-card" data-idx="${i}">
                            <span>${d.name}</span>
                            <span class="cost">${d.cost} gold</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // Player turn
        if (state.is_my_turn && state.phase === 'PlayerTurn') {
            content += `<div class="turn-indicator">Your turn! (${state.current_role})</div>`;

            // Action buttons
            content += '<div class="action-buttons">';
            if (state.can_take_action) {
                content += '<button id="btn-gold">Take 2 Gold</button>';
                content += '<button id="btn-draw">Draw Cards</button>';
            }
            if (state.can_use_ability && state.valid_targets && state.valid_targets.length > 0) {
                content += '<button id="btn-ability">Use Ability</button>';
            }
            content += '<button id="btn-end">End Turn</button>';
            content += '</div>';

            // Ability targets
            if (state.can_use_ability && state.valid_targets) {
                content += `<div class="ability-section hidden" id="ability-targets">
                    <div class="section-title">Choose target</div>
                    <div class="target-list">
                        ${state.valid_targets.map(t => `<div class="target-option" data-target="${t}">${t}</div>`).join('')}
                    </div>
                </div>`;
            }

            // Hand (buildable)
            if (state.can_build && state.hand && state.hand.length > 0) {
                content += `<div class="section">
                    <div class="section-title">Build a district (tap to build)</div>
                    <div class="hand-cards">
                        ${state.hand.map(d => `
                            <div class="hand-card buildable" data-name="${d.name}">
                                <span>${d.name} <small style="color:#888">${colorLabel(d.color)}</small></span>
                                <span class="cost">${d.cost} gold</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
        } else if (state.phase === 'PlayerTurn' && !state.is_my_turn) {
            content += `<div class="waiting">Waiting... ${state.current_role || ''} is playing</div>`;
        }

        // Hand (non-turn view)
        if (!(state.is_my_turn && state.phase === 'PlayerTurn' && state.can_build)) {
            if (state.hand && state.hand.length > 0) {
                content += `<div class="section">
                    <div class="section-title">Hand</div>
                    <div class="hand-cards">
                        ${state.hand.map(d => `
                            <div class="hand-card">
                                <span>${d.name} <small style="color:#888">${colorLabel(d.color)}</small></span>
                                <span class="cost">${d.cost} gold</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }
        }

        // City
        const city = me ? me.city || [] : [];
        if (city.length > 0) {
            const colorMap = { Noble: 'color-noble', Religious: 'color-religious', Trade: 'color-trade', Military: 'color-military', Special: 'color-special' };
            content += `<div class="section">
                <div class="section-title">City (${city.length})</div>
                <div class="city-cards">
                    ${city.map(d => `<span class="city-card ${colorMap[d.color] || ''}">${d.name} (${d.cost})</span>`).join('')}
                </div>
            </div>`;
        }

        app.innerHTML = content;
        bindActions();
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
                            // Need to pick a player - for now use first other player
                            const others = (state.players || []).filter(p => p.id !== playerID);
                            if (others.length > 0) {
                                ws.send('ability', { extra_data: 'swap_hand', target: others[0].id });
                            }
                        } else {
                            // Discard/draw - select cards to discard (first card for simplicity)
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
                <h1>Game Over!</h1>
                <div class="scores-section">
                    ${scores.map((s, i) => `
                        <div class="score-row ${i === 0 ? 'winner' : ''}">
                            <span>${i === 0 ? '🏆 ' : ''}${s.player_name}</span>
                            <span>${s.total} pts</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function showError(msg) {
        console.error('Server error:', msg);
        // Could show a toast notification here
    }

    function colorLabel(color) {
        const names = { 1: 'Noble', 2: 'Religious', 3: 'Trade', 4: 'Military', 5: 'Special' };
        return names[color] || '';
    }

    function roleNameToNum(name) {
        const map = { Assassin: 1, Thief: 2, Magician: 3, King: 4, Bishop: 5, Merchant: 6, Architect: 7, Warlord: 8 };
        return map[name] || 0;
    }

    connectWS();
    render();
})();
