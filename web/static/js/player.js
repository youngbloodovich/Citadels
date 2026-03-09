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
    let magicianMode = null; // 'swap_hand' | 'discard_draw' | null
    let selectedDiscardIndices = new Set();
    let labMode = false;
    let tableOpen = true;
    const eventLog = [];
    const MAX_LOG = 30;
    let timerInterval = null;

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
                else if (env.type === 'event') { pushEvent(env.payload); render(); }
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
                <br><button id="leave-btn" style="margin-top:12px;background:#555;color:#ccc;">${t('leave_lobby')}</button>
            </div>
        `;
        document.getElementById('ready-btn').onclick = () => {
            ws.send('ready', { ready: !amReady });
        };
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.onclick = () => ws.send('start_game', {});
        }
        document.getElementById('leave-btn').onclick = () => {
            ws.send('leave', {});
            window.location.href = '/';
        };
        bindLangSwitcher(render);
    }

    function renderGameState(app) {
        if (!state) return;

        if (state.phase === 'GameOver') { renderGameOver(app); return; }

        // Reset magician UI when ability is no longer available
        if (!state.can_use_ability || state.current_role !== 'Magician') {
            magicianMode = null;
            selectedDiscardIndices.clear();
        }

        // Reset lab mode when no longer available
        if (!state.can_use_lab) {
            labMode = false;
        }

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

        content += renderTable();

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
                <div class="section-title">${t('choose_character')} ${timerBadgeHTML()}</div>
                <div class="draft-choices">
                    ${state.draft_choices.map((c, i) => `<div class="draft-choice" data-role="${i}">${t(c)}</div>`).join('')}
                </div>
            </div>`;
        } else if (state.phase === 'DraftPick') {
            content += `<div class="waiting">${t('waiting_for_pick')} ${timerBadgeHTML()}</div>`;
        }

        // Draw choice
        if (state.phase === 'DrawChoice' && state.drawn_cards) {
            content += `<div class="section">
                <div class="section-title">${t('choose_card_keep')} ${timerBadgeHTML()}</div>
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
            content += `<div class="turn-indicator">${t('your_turn')} (${t(state.current_role)}) ${timerBadgeHTML()}</div>`;

            // Action buttons
            content += '<div class="action-buttons">';
            if (state.can_take_action) {
                content += `<button id="btn-gold">${t('take_2_gold')}</button>`;
                content += `<button id="btn-draw">${t('draw_cards')}</button>`;
            }
            if (state.can_collect_gold) {
                content += `<button id="btn-collect-gold">${t('collect_gold', { count: state.collect_gold_amount })}</button>`;
            }
            if (state.can_use_ability && state.valid_targets && state.valid_targets.length > 0) {
                content += `<button id="btn-ability">${t('use_ability')}</button>`;
            }
            if (state.can_use_lab) {
                content += `<button id="btn-lab" class="${labMode ? 'active' : ''}">${labMode ? t('lab_cancel') : t('lab_btn')}</button>`;
            }
            if (state.can_use_smithy) {
                content += `<button id="btn-smithy">${t('smithy_btn')}</button>`;
            }
            content += `<button id="btn-end">${t('end_turn')}</button>`;
            content += '</div>';

            // Ability targets
            if (state.can_use_ability && state.valid_targets && !magicianMode) {
                content += `<div class="ability-section hidden" id="ability-targets">
                    <div class="section-title">${t('choose_target')}</div>`;
                if (state.current_role === 'Warlord') {
                    // Group targets by player
                    const groups = {};
                    state.valid_targets.forEach(tgt => {
                        const parts = tgt.split(':');
                        const pid = parts[0];
                        if (!groups[pid]) groups[pid] = [];
                        groups[pid].push(tgt);
                    });
                    for (const pid of Object.keys(groups)) {
                        const player = (state.players || []).find(p => p.id === pid);
                        const playerName = player ? player.name : pid;
                        content += `<div class="target-group">
                            <div class="target-group-name">${playerName}</div>
                            <div class="target-list">
                                ${groups[pid].map(tgt => {
                                    const districtName = tgt.split(':')[1];
                                    const district = player && (player.city || []).find(d => d.name === districtName);
                                    const hasGreatWall = player && (player.city || []).some(d => d.name === 'Great Wall');
                                    const cost = district ? district.cost - (hasGreatWall ? 0 : 1) : '?';
                                    return `<div class="target-option" data-target="${tgt}">${t(districtName)} <span class="destroy-cost">(${cost} ${t('gold')})</span></div>`;
                                }).join('')}
                            </div>
                        </div>`;
                    }
                } else {
                    content += `<div class="target-list">
                        ${state.valid_targets.map(tgt => `<div class="target-option" data-target="${tgt}">${translateTarget(tgt)}</div>`).join('')}
                    </div>`;
                }
                content += `</div>`;
            }

            // Magician: choose player to swap hands with
            if (state.current_role === 'Magician' && magicianMode === 'swap_hand') {
                const others = (state.players || []).filter(p => p.id !== playerID);
                content += `<div class="ability-section" id="magician-swap">
                    <div class="section-title">${t('choose_player_swap')}</div>
                    <div class="target-list">
                        ${others.map(p => `<div class="target-option magician-swap-target" data-pid="${p.id}">${p.name}</div>`).join('')}
                    </div>
                </div>`;
            }

            // Magician: select cards to discard and redraw
            if (state.current_role === 'Magician' && magicianMode === 'discard_draw') {
                content += `<div class="ability-section" id="magician-discard">
                    <div class="section-title">${t('choose_cards_discard')}</div>
                    <div class="hand-cards">
                        ${(state.hand || []).map((d, i) => `
                            <div class="hand-card magician-discard-card ${selectedDiscardIndices.has(i) ? 'selected' : ''} ${colorClass(d.color)}" data-idx="${i}">
                                <div><span>${t(d.name)} <small style="color:#888">${colorLabel(d.color)}</small></span>
                                ${districtEffect(d.name) ? `<div class="card-effect">${districtEffect(d.name)}</div>` : ''}</div>
                                <span class="cost">${d.cost} ${t('gold')}</span>
                            </div>
                        `).join('')}
                    </div>
                    <button id="magician-discard-confirm" style="margin-top:10px;width:100%;" ${selectedDiscardIndices.size === 0 ? 'disabled' : ''}>${t('discard_and_draw')} (${selectedDiscardIndices.size})</button>
                </div>`;
            }

            // Laboratory: select card to discard
            if (labMode && state.hand && state.hand.length > 0) {
                content += `<div class="section">
                    <div class="section-title">${t('lab_select_card')}</div>
                    <div class="hand-cards">
                        ${state.hand.map(d => `
                            <div class="hand-card lab-discard-card ${colorClass(d.color)}" data-name="${d.name}">
                                <div><span>${t(d.name)} <small style="color:#888">${colorLabel(d.color)}</small></span>
                                ${districtEffect(d.name) ? `<div class="card-effect">${districtEffect(d.name)}</div>` : ''}</div>
                                <span class="cost">${d.cost} ${t('gold')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }

            // Hand (buildable)
            if (!labMode && state.can_build && state.hand && state.hand.length > 0) {
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
            content += `<div class="waiting">${t('waiting')} ${state.current_role ? t(state.current_role) : ''} ${t('waiting_playing')} ${timerBadgeHTML()}</div>`;
        }

        // Hand (non-turn view)
        if (!(state.is_my_turn && state.phase === 'PlayerTurn' && (state.can_build || labMode))) {
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

        // Graveyard prompt (shown regardless of whose turn it is)
        if (state.graveyard_choice) {
            content += `<div class="section graveyard-prompt" style="background:#2d1b3d;border:2px solid #9b59b6;border-radius:8px;padding:12px;margin:8px 0;">
                <div style="margin-bottom:8px;">${t('graveyard_prompt', { district: t(state.graveyard_choice.district_name), cost: state.graveyard_choice.district_cost })} ${timerBadgeHTML()}</div>
                <div style="display:flex;gap:8px;">
                    <button id="btn-graveyard-accept" style="flex:1;background:#27ae60;">${t('graveyard_accept')}</button>
                    <button id="btn-graveyard-decline" style="flex:1;background:#c0392b;">${t('graveyard_decline')}</button>
                </div>
            </div>`;
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
        startTimerCountdown();
        const logList = document.querySelector('.table-log');
        if (logList) logList.scrollTop = logList.scrollHeight;
    }

    function bindActions() {
        // Table toggle
        const tableToggle = document.getElementById('table-toggle');
        if (tableToggle) {
            tableToggle.onclick = () => { tableOpen = !tableOpen; render(); };
        }

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

        const btnCollectGold = document.getElementById('btn-collect-gold');
        if (btnCollectGold) btnCollectGold.onclick = () => ws.send('collect_gold', {});

        const btnEnd = document.getElementById('btn-end');
        if (btnEnd) btnEnd.onclick = () => ws.send('end_turn', {});

        const btnAbility = document.getElementById('btn-ability');
        if (btnAbility) {
            btnAbility.onclick = () => {
                if (magicianMode) {
                    // Cancel magician sub-mode
                    magicianMode = null;
                    selectedDiscardIndices.clear();
                    render();
                    return;
                }
                const targets = document.getElementById('ability-targets');
                if (targets) targets.classList.toggle('hidden');
            };
        }

        // Ability targets (skip magician sub-targets which have their own handlers)
        document.querySelectorAll('.target-option[data-target]').forEach(el => {
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
                        magicianMode = target;
                        selectedDiscardIndices.clear();
                        render();
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

        // Magician: swap hand — pick a player
        document.querySelectorAll('.magician-swap-target').forEach(el => {
            el.onclick = () => {
                ws.send('ability', { extra_data: 'swap_hand', target: el.dataset.pid });
                magicianMode = null;
            };
        });

        // Magician: discard/draw — toggle card selection
        document.querySelectorAll('.magician-discard-card').forEach(el => {
            el.onclick = () => {
                const idx = parseInt(el.dataset.idx);
                if (selectedDiscardIndices.has(idx)) {
                    selectedDiscardIndices.delete(idx);
                } else {
                    selectedDiscardIndices.add(idx);
                }
                render();
            };
        });

        // Magician: confirm discard
        const discardConfirm = document.getElementById('magician-discard-confirm');
        if (discardConfirm) {
            discardConfirm.onclick = () => {
                if (selectedDiscardIndices.size > 0) {
                    ws.send('ability', { extra_data: 'discard_draw', indices: Array.from(selectedDiscardIndices) });
                    magicianMode = null;
                    selectedDiscardIndices.clear();
                }
            };
        }

        // Lab button
        const btnLab = document.getElementById('btn-lab');
        if (btnLab) {
            btnLab.onclick = () => {
                labMode = !labMode;
                render();
            };
        }

        // Lab card discard
        document.querySelectorAll('.lab-discard-card').forEach(el => {
            el.onclick = () => {
                ws.send('lab_discard', { district_name: el.dataset.name });
                labMode = false;
            };
        });

        // Smithy button
        const btnSmithy = document.getElementById('btn-smithy');
        if (btnSmithy) {
            btnSmithy.onclick = () => {
                ws.send('smithy_draw', {});
            };
        }

        // Graveyard buttons
        const btnGraveyardAccept = document.getElementById('btn-graveyard-accept');
        if (btnGraveyardAccept) {
            btnGraveyardAccept.onclick = () => {
                ws.send('graveyard_respond', { extra_data: 'accept' });
            };
        }
        const btnGraveyardDecline = document.getElementById('btn-graveyard-decline');
        if (btnGraveyardDecline) {
            btnGraveyardDecline.onclick = () => {
                ws.send('graveyard_respond', { extra_data: 'decline' });
            };
        }

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
        const players = state.players || [];
        app.innerHTML = `
            <div style="padding:16px;">
                ${langSwitcherHTML()}
                <h1 style="text-align:center;margin-bottom:16px;">${t('game_over')}</h1>
                <table class="scores-table">
                    <thead>
                        <tr>
                            <th>${t('player')}</th>
                            <th>${t('districts')}</th>
                            <th>${t('colors')}</th>
                            <th>${t('complete')}</th>
                            <th>${t('special')}</th>
                            <th>${t('total')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${scores.map((s, i) => {
                            const player = players.find(p => p.id === s.player_id);
                            const city = player ? player.city || [] : [];
                            return `
                            <tr class="${i === 0 ? 'winner-row' : ''}">
                                <td>${i === 0 ? '🏆 ' : ''}${s.player_name}</td>
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
            const pid = parts[0];
            const districtName = parts[1];
            const player = (state.players || []).find(p => p.id === pid);
            const playerName = player ? player.name : pid;
            let costText = '';
            if (player) {
                const district = (player.city || []).find(d => d.name === districtName);
                const hasGreatWall = (player.city || []).some(d => d.name === 'Great Wall');
                if (district) costText = ` (${district.cost - (hasGreatWall ? 0 : 1)} ${t('gold')})`;
            }
            return playerName + ': ' + t(districtName) + costText;
        }
        return t(target);
    }

    function roleNameToNum(name) {
        const map = { Assassin: 1, Thief: 2, Magician: 3, King: 4, Bishop: 5, Merchant: 6, Architect: 7, Warlord: 8 };
        return map[name] || 0;
    }

    // --- Table panel (other players) ---

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

    function pushEvent(ev) {
        const entry = formatEvent(ev);
        if (entry) {
            eventLog.push(entry);
            if (eventLog.length > MAX_LOG) eventLog.shift();
        }
    }

    function renderTable() {
        if (!state || !state.players) return '';

        const phase = state.phase ? t(state.phase) : '';
        const round = state.round || '';
        const currentTurn = state.current_turn || '';
        const statusText = phase + (round ? ' — ' + t('round') + ' ' + round : '') + (currentTurn ? ' — ' + currentTurn : '');

        const others = state.players.filter(p => p.id !== playerID);

        let cardsHTML = others.map(p => {
            const isActive = state.current_turn === p.name;
            const roles = (p.revealed_roles && p.revealed_roles.length > 0)
                ? `<div class="mini-roles">${p.revealed_roles.map(r => t(r)).join(', ')}</div>`
                : '';
            const city = (p.city || []).map(d =>
                `<span class="district-chip ${colorClass(d.color)}">${t(d.name)}${districtEffect(d.name) ? `<span class="district-effect">${districtEffect(d.name)}</span>` : ''}</span>`
            ).join(' ');
            return `<div class="mini-card ${isActive ? 'active' : ''}">
                <div class="mini-name">${p.name}${p.has_crown ? ' 👑' : ''} <span class="mini-stats">${p.gold}g · ${p.hand_size} ${t('cards')}</span></div>
                ${roles}
                ${city ? `<div class="mini-city">${city}</div>` : ''}
            </div>`;
        }).join('');

        const logHTML = eventLog.length > 0
            ? `<div class="table-log">${eventLog.map(e => `<div class="event-entry ${e.css}">${e.text}</div>`).join('')}</div>`
            : '';

        return `<div class="table-panel">
            <div class="table-toggle" id="table-toggle">
                <span class="table-label">${t('table_title')} ${tableOpen ? '▲' : '▼'}</span>
                <span class="table-status">${statusText}</span>
            </div>
            <div class="table-content ${tableOpen ? '' : 'collapsed'}">
                ${cardsHTML}
                ${logHTML}
            </div>
        </div>`;
    }

    function timerBadgeHTML() {
        if (!state || !state.timer_deadline) return '';
        const remaining = Math.max(0, Math.ceil((state.timer_deadline - Date.now()) / 1000));
        const urgent = remaining <= 10 ? ' urgent' : '';
        return `<span class="timer-badge${urgent}">${t('time_left', { seconds: remaining })}</span>`;
    }

    function startTimerCountdown() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (!state || !state.timer_deadline) return;
        timerInterval = setInterval(() => {
            const badges = document.querySelectorAll('.timer-badge');
            if (badges.length === 0) { clearInterval(timerInterval); timerInterval = null; return; }
            const remaining = Math.max(0, Math.ceil((state.timer_deadline - Date.now()) / 1000));
            const urgent = remaining <= 10;
            badges.forEach(b => {
                b.textContent = t('time_left', { seconds: remaining });
                b.classList.toggle('urgent', urgent);
            });
        }, 1000);
    }

    connectWS();
    render();
})();
