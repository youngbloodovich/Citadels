// TV screen logic
(function() {
    const params = new URLSearchParams(location.search);
    const gameID = params.get('game');
    if (!gameID) {
        document.body.innerHTML = '<div class="container"><h1>No game ID</h1><p><a href="/api/create">Create a new game</a></p></div>';
        return;
    }

    const wsUrl = `ws://${location.host}/ws?game=${gameID}&type=tv`;
    let state = null;

    const ws = new WS(wsUrl,
        (env) => {
            if (env.type === 'lobby_update') renderLobby(env.payload);
            else if (env.type === 'game_state') { state = env.payload; renderGame(); }
            else if (env.type === 'event') handleEvent(env.payload);
        },
        () => console.log('TV connected'),
        () => console.log('TV disconnected')
    );

    function renderLobby(data) {
        if (data.started && state) { renderGame(); return; }
        const app = document.getElementById('tv-app');
        app.innerHTML = `
            <div class="tv-header">
                <h1>Citadels</h1>
                <span class="phase-badge">Lobby</span>
            </div>
            <div class="qr-section">
                <h2>Scan to join!</h2>
                <img src="/api/qr?game=${gameID}" alt="QR Code" width="256" height="256">
                <p style="font-size:16px;color:#888;margin-top:8px;">Game: ${gameID}</p>
            </div>
            <div class="lobby-players">
                ${(data.players || []).map(p => `
                    <div class="lobby-player ${p.ready ? 'ready' : ''}">
                        ${p.name} ${p.ready ? '✓' : '...'}
                    </div>
                `).join('')}
            </div>
            <p style="text-align:center;color:#888;">${(data.players||[]).length} player(s) joined</p>
        `;
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
                    <h2>Draft Phase - Round ${state.round}</h2>
                    ${state.draft_face_up && state.draft_face_up.length > 0 ?
                        `<div class="face-up">Face up: ${state.draft_face_up.join(', ')}</div>` : ''}
                    <p>Available: ${state.draft_available} characters</p>
                    ${state.draft_picker ? `<p style="font-size:24px;margin-top:12px;">Picking: <strong>${state.draft_picker}</strong></p>` : ''}
                </div>
            `;
        }

        let callHTML = '';
        if (state.phase === 'PlayerTurn' || state.phase === 'DrawChoice' || state.phase === 'Ability') {
            callHTML = `
                <div class="call-banner">
                    ${state.current_role || ''} ${state.current_turn ? `- ${state.current_turn}'s turn` : ''}
                </div>
            `;
        }

        app.innerHTML = `
            <div class="tv-header">
                <h1>Citadels</h1>
                <span class="phase-badge">${state.phase} - Round ${state.round}</span>
                <span style="color:#888">Deck: ${state.deck_size}</span>
            </div>
            ${draftHTML}
            ${callHTML}
            <div class="players-grid">
                ${(state.players || []).map(p => renderPlayerCard(p)).join('')}
            </div>
        `;
    }

    function renderPlayerCard(p) {
        const isActive = state.current_turn === p.name;
        const colorMap = { Noble: 'color-noble', Religious: 'color-religious', Trade: 'color-trade', Military: 'color-military', Special: 'color-special' };
        return `
            <div class="player-card ${isActive ? 'active' : ''}">
                <div class="name ${p.has_crown ? 'crown' : ''}">${p.name}</div>
                <div class="stats">
                    <span class="gold">${p.gold} gold</span>
                    <span>${p.hand_size} cards</span>
                </div>
                ${p.revealed_roles && p.revealed_roles.length > 0 ?
                    `<div style="color:#9b59b6;margin:4px 0;">${p.revealed_roles.join(', ')}</div>` : ''}
                <div class="city-districts">
                    ${(p.city || []).map(d => `<span class="district-chip ${colorMap[d.color] || ''}">${d.name} (${d.cost})</span>`).join('')}
                </div>
            </div>
        `;
    }

    function renderGameOver(app) {
        const scores = state.scores || [];
        scores.sort((a, b) => b.total - a.total);
        app.innerHTML = `
            <div class="tv-header">
                <h1>Game Over!</h1>
            </div>
            <table class="scores-table">
                <thead>
                    <tr><th>Player</th><th>Districts</th><th>Colors</th><th>Complete</th><th>Special</th><th>Total</th></tr>
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
    }

    function handleEvent(ev) {
        // Events are processed via state updates
        console.log('Event:', ev.type, ev);
    }

    // Initial lobby render
    renderLobby({ players: [], started: false });
})();
