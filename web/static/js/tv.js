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
    const logKey = 'citadels_log_tv_' + gameID;
    const eventLog = JSON.parse(sessionStorage.getItem(logKey) || '[]');
    const MAX_LOG = 50;
    let timerInterval = null;

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
        const joinUrl = 'http://' + location.host + '/lobby.html?game=' + gameID;
        const players = data.players || [];
        const playersHTML = players.length > 0
            ? players.map(p => `<div class="lobby-player ${p.ready ? 'ready' : ''}">${p.name} ${p.ready ? '✓' : '...'}</div>`).join('')
            : `<div class="lobby-empty">${t('waiting_for_players')}</div>`;
        app.innerHTML = `
            <div class="lobby-screen">
                <div class="lobby-card">
                    <h1 class="lobby-title">${t('home_title')}</h1>
                    <p class="lobby-subtitle">${t('lobby_subtitle')}</p>
                    <div class="lobby-divider"></div>
                    <div class="lobby-join-area">
                        <div class="lobby-qr">
                            <img src="/api/qr?game=${gameID}" alt="QR" width="180" height="180">
                        </div>
                        <div class="lobby-join-info">
                            <p class="lobby-step"><span class="lobby-step-num">1</span>${t('scan_to_join')}</p>
                            <p class="lobby-step"><span class="lobby-step-num">2</span>${t('or_copy_link')}</p>
                            <div class="lobby-link-row">
                                <span class="lobby-link-url">${joinUrl}</span>
                                <button id="copy-link-btn" class="lobby-copy-btn">${t('copy_link')}</button>
                            </div>
                        </div>
                    </div>
                    <div class="lobby-divider"></div>
                    <div class="lobby-players-area">
                        <p class="lobby-players-label">${players.length} ${t('players_joined')}</p>
                        <div class="lobby-players">${playersHTML}</div>
                    </div>
                </div>
                <div class="lobby-footer">
                    <button onclick="location.href='/'" class="lobby-back-btn">${t('leave_lobby')}</button>
                    ${langSwitcherHTML()}
                </div>
            </div>
        `;
        bindLangSwitcher(rerender);
        const copyBtn = document.getElementById('copy-link-btn');
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
            btn.textContent = t('link_copied');
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = t('copy_link');
                btn.classList.remove('copied');
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
                    ${state.draft_picker ? `<p style="font-size:24px;margin-top:12px;">${t('picking')}: <strong>${state.draft_picker}</strong> ${timerBadgeHTML()}</p>` : ''}
                </div>
            `;
        }

        let callHTML = '';
        if (state.phase === 'PlayerTurn' || state.phase === 'DrawChoice' || state.phase === 'Ability') {
            callHTML = `
                <div class="call-banner">
                    ${state.current_role ? t(state.current_role) : ''} ${state.current_turn ? `- ${state.current_turn}` : ''} ${timerBadgeHTML()}
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
            ${characterBarHTML(state)}
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
        startTimerCountdown();
    }

    function cityScore(p) {
        return (p.city || []).reduce((sum, d) => sum + d.cost, 0);
    }

    function renderPlayerCard(p) {
        const isActive = state.current_turn === p.name;
        return `
            <div class="player-card ${isActive ? 'active' : ''}">
                <div class="name ${p.has_crown ? 'crown' : ''}">${p.name}</div>
                <div class="stats">
                    <span class="gold">${p.gold} ${t('gold')}</span>
                    <span>${p.hand_size} ${t('cards')}</span>
                    <span>${cityScore(p)} ${t('pts')}</span>
                </div>
                ${p.revealed_roles && p.revealed_roles.length > 0 ?
                    `<div style="color:#9b59b6;margin:4px 0;">${p.revealed_roles.map(r => t(r)).join(', ')}</div>` : ''}
                <div class="city-districts">
                    ${(p.city || []).map(d => `<span class="district-chip ${colorClass(d.color)}">${t(d.name)} (${d.cost})${districtEffect(d.name) ? `<span class="district-effect">${districtEffect(d.name)}</span>` : ''}</span>`).join('')}
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
                                ${city.map(d => `<span class="district-chip ${colorClass(d.color)}">${t(d.name)} (${d.cost})${districtEffect(d.name) ? `<span class="district-effect">${districtEffect(d.name)}</span>` : ''}</span>`).join('')}
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
            sessionStorage.setItem(logKey, JSON.stringify(eventLog));
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
                return { text: t('ev_character_call', { number: d.number, role: t(d.role), player: d.player ? ' (' + d.player + ')' : '' }), css: 'ev-call' };
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

    // Initial lobby render
    renderLobby({ players: [], started: false });
})();
