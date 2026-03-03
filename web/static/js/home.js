(function() {
    function render() {
        var app = document.getElementById('home-app');
        app.innerHTML =
            '<div class="home-container">' +
                '<div class="home-header">' +
                    '<h1>' + t('home_title') + '</h1>' +
                    langSwitcherHTML() +
                '</div>' +

                '<div class="card home-section">' +
                    '<h2>' + t('home_create') + '</h2>' +
                    '<p>' + t('home_create_desc') + '</p>' +
                    '<button id="btn-create">' + t('home_create') + '</button>' +
                '</div>' +

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
                        '<button class="btn-refresh" id="btn-refresh">' + t('home_browse_refresh') + '</button>' +
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

        document.getElementById('btn-refresh').onclick = loadGames;

        bindLangSwitcher(function() { render(); loadGames(); });

        loadGames();
    }

    function joinByCode() {
        var code = document.getElementById('input-code').value.trim();
        if (code) {
            window.location.href = '/lobby.html?game=' + encodeURIComponent(code);
        }
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
                                '<div class="game-players">' + t('home_players') + ': ' + g.players + '/' + g.max_players + '</div>' +
                                (names ? '<div class="game-names">' + names + '</div>' : '') +
                            '</div>' +
                            '<button onclick="window.location.href=\'/lobby.html?game=' + g.id + '\'">' + t('home_join_game') + '</button>' +
                        '</div>';
                });
                container.innerHTML = html;
            })
            .catch(function() {});
    }

    render();
})();
