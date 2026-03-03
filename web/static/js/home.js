(function() {
    var refreshTimer = null;

    function render() {
        var app = document.getElementById('home-app');
        app.innerHTML =
            '<div class="home-container">' +
                '<div class="home-header">' +
                    '<h1>' + t('home_title') + '</h1>' +
                    langSwitcherHTML() +
                '</div>' +

                '<button class="btn-create" id="btn-create">' + t('home_create') + '</button>' +

                '<div class="card home-section">' +
                    '<h2>' + t('home_join') + '</h2>' +
                    '<div class="join-row">' +
                        '<input id="input-code" type="text" placeholder="' + t('home_join_placeholder') + '" maxlength="16" />' +
                        '<button id="btn-join">' + t('home_join_btn') + '</button>' +
                    '</div>' +
                '</div>' +

                '<div class="card home-section">' +
                    '<div class="browse-header">' +
                        '<h2>' + t('home_browse') + '</h2>' +
                    '</div>' +
                    '<div id="games-list" class="games-list">' +
                        '<div class="games-empty">' + t('home_browse_empty') + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.getElementById('btn-create').onclick = function() {
            window.location.href = '/api/create';
        };

        document.getElementById('btn-join').onclick = joinByCode;
        document.getElementById('input-code').onkeydown = function(e) {
            if (e.key === 'Enter') joinByCode();
        };

        bindLangSwitcher(function() { render(); });

        startAutoRefresh();
    }

    function joinByCode() {
        var code = document.getElementById('input-code').value.trim();
        if (code) {
            window.location.href = '/lobby.html?game=' + encodeURIComponent(code);
        }
    }

    function startAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        loadGames();
        refreshTimer = setInterval(loadGames, 3000);
    }

    function loadGames() {
        fetch('/api/games')
            .then(function(r) { return r.json(); })
            .then(function(games) {
                var container = document.getElementById('games-list');
                if (!container) return;

                if (!games || games.length === 0) {
                    container.innerHTML = '<div class="games-empty">' + t('home_browse_empty') + '</div>';
                    return;
                }

                var html = '';
                games.forEach(function(g) {
                    var names = g.player_names && g.player_names.length > 0
                        ? g.player_names.join(', ')
                        : '';
                    html +=
                        '<div class="game-item">' +
                            '<div class="game-info">' +
                                '<div class="game-id">' + g.id + '</div>' +
                                '<div class="game-players">' + g.players + '/' + g.max_players + (names ? ' — ' + names : '') + '</div>' +
                            '</div>' +
                            '<button class="btn-join-game" onclick="window.location.href=\'/lobby.html?game=' + g.id + '\'">' + t('home_join_game') + '</button>' +
                        '</div>';
                });
                container.innerHTML = html;
            })
            .catch(function() {});
    }

    render();
})();
