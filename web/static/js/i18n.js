// Localization module for Citadels
(function() {
    const translations = {
        en: {
            // Characters
            'Assassin': 'Assassin',
            'Thief': 'Thief',
            'Magician': 'Magician',
            'King': 'King',
            'Bishop': 'Bishop',
            'Merchant': 'Merchant',
            'Architect': 'Architect',
            'Warlord': 'Warlord',

            // Districts
            'Manor': 'Manor',
            'Castle': 'Castle',
            'Palace': 'Palace',
            'Temple': 'Temple',
            'Church': 'Church',
            'Monastery': 'Monastery',
            'Cathedral': 'Cathedral',
            'Tavern': 'Tavern',
            'Trading Post': 'Trading Post',
            'Market': 'Market',
            'Docks': 'Docks',
            'Harbor': 'Harbor',
            'Town Hall': 'Town Hall',
            'Watchtower': 'Watchtower',
            'Prison': 'Prison',
            'Battlefield': 'Battlefield',
            'Fortress': 'Fortress',
            'Haunted City': 'Haunted City',
            'Keep': 'Keep',
            'Laboratory': 'Laboratory',
            'Smithy': 'Smithy',
            'Observatory': 'Observatory',
            'Graveyard': 'Graveyard',
            'Great Wall': 'Great Wall',
            'School of Magic': 'School of Magic',
            'Library': 'Library',
            'University': 'University',
            'Dragon Gate': 'Dragon Gate',
            'Imperial Treasury': 'Imperial Treasury',
            'Map Room': 'Map Room',

            // Colors
            'Noble': 'Noble',
            'Religious': 'Religious',
            'Trade': 'Trade',
            'Military': 'Military',
            'Special': 'Special',

            // UI — home
            'home_title': 'Citadels',
            'home_create': 'Create Game',
            'home_join': 'Join by Code',
            'home_join_placeholder': 'Game code',
            'home_join_btn': 'Join',
            'home_browse': 'Find Game',
            'home_browse_empty': 'No active games',
            'home_join_game': 'Join',
            'leave_lobby': 'Leave',

            // UI — common
            'citadels': 'Citadels',
            'game_over': 'Game Over!',
            'gold': 'gold',
            'cards': 'cards',
            'no_game_id': 'No game ID',

            // UI — lobby
            'lobby': 'Lobby',
            'scan_to_join': 'Scan QR code to enter the lobby!',
            'or_copy_link': 'Or copy the link and send it to friends',
            'follow_link': 'Follow the link to join the lobby:',
            'copy_link': 'Copy Link',
            'link_copied': 'Copied!',
            'game_label': 'Game',
            'players_joined': 'player(s) joined',
            'waiting_for_players': 'Waiting for players...',
            'ready': 'Ready!',
            'not_ready': 'Not Ready',
            'start_game': 'Start Game',

            // UI — join
            'your_name': 'Your name',
            'join_game': 'Join Game',

            // UI — draft
            'draft_phase': 'Draft Phase',
            'round': 'Round',
            'face_up': 'Face up',
            'available_chars': 'Available',
            'characters': 'characters',
            'picking': 'Picking',
            'choose_character': 'Choose a character',
            'waiting_for_pick': 'Waiting for other players to pick...',

            // UI — turn
            'your_turn': 'Your turn!',
            'take_2_gold': 'Take 2 Gold',
            'draw_cards': 'Draw Cards',
            'use_ability': 'Use Ability',
            'end_turn': 'End Turn',
            'choose_target': 'Choose target',
            'build_district': 'Build a district (tap to build)',
            'hand': 'Hand',
            'city': 'City',
            'waiting_playing': 'is playing',
            'waiting': 'Waiting...',
            'choose_card_keep': 'Choose a card to keep',
            'swap_hand': 'Swap hand',
            'discard_draw': 'Discard & Draw',
            'choose_player_swap': 'Choose player to swap hands with',
            'choose_cards_discard': 'Select cards to discard',
            'discard_and_draw': 'Discard & Draw',
            'your_characters': 'Your Characters',
            'lab_btn': 'Laboratory',
            'lab_select_card': 'Select a card to discard for 1 gold',
            'lab_cancel': 'Cancel',
            'smithy_btn': 'Smithy (2g → 3 cards)',
            'graveyard_prompt': 'Graveyard: Pay 1 gold to take {district} ({cost}g) into your hand?',
            'graveyard_accept': 'Accept',
            'graveyard_decline': 'Decline',

            // UI — deck
            'deck': 'Deck',

            // UI — scores
            'player': 'Player',
            'districts': 'Districts',
            'colors': 'Colors',
            'complete': 'Complete',
            'special': 'Special',
            'total': 'Total',
            'pts': 'pts',
            'exit_game': 'Exit',

            // UI — table panel
            'table_title': 'Table',

            // UI — collect gold
            'collect_gold': 'Collect Gold ({count})',

            // UI — event log
            'event_log': 'Event Log',

            // Events
            'ev_draft_start': 'Round {round} — Draft started',
            'ev_draft_pick': '{player} picked a character',
            'ev_draft_done': 'Draft complete — Resolution begins',
            'ev_character_call': 'Calling #{number} {role}...{player}',
            'ev_murdered': '{role} ({player}) was murdered!',
            'ev_robbed': '{role} ({player}) was robbed of {stolen} gold by {thief}!',
            'ev_gold_taken': '{player} took {gold} gold',
            'ev_cards_drawn': '{player} drew {count} cards',
            'ev_district_built': '{player} built {district} ({cost}g)',
            'ev_assassin_kill': '{player} (Assassin) targeted {role}',
            'ev_thief_rob': '{player} (Thief) targeted {role}',
            'ev_magician_swap': '{player} (Magician) swapped hands with {target}',
            'ev_magician_discard': '{player} (Magician) discarded {count} cards',
            'ev_merchant_bonus': '{player} (Merchant) +1 bonus gold',
            'ev_architect_draw': '{player} (Architect) drew {count} extra cards',
            'ev_warlord_destroy': '{player} (Warlord) destroyed {district} of {target} for {cost}g',
            'ev_lab_discard': '{player}: Laboratory — discarded {district} for 1g',
            'ev_smithy_draw': '{player}: Smithy — 2g → {count} cards',
            'ev_graveyard_accept': '{player}: Graveyard — paid 1g for {district}',
            'ev_graveyard_decline': '{player}: Graveyard — declined {district}',
            'ev_gold_collected': '{player} collected {count} gold ({color})',
            'ev_crown_passed': 'Crown passed to {player}',
            'ev_turn_end': '{player} ({role}) ended turn',
            'ev_round_end': 'Round {round} ended',
            'ev_game_over': 'Game Over!',

            // District effects
            'effect_Haunted City': 'Counts as any color for the 5-color bonus at end of game',
            'effect_Keep': 'Cannot be destroyed by the Warlord',
            'effect_Laboratory': 'Discard 1 card from hand → gain 1 gold',
            'effect_Smithy': 'Pay 2 gold → draw 3 cards',
            'effect_Observatory': 'When drawing cards, draw 3 instead of 2',
            'effect_Graveyard': 'Pay 1 gold to take a destroyed district into your hand',
            'effect_Great Wall': 'Warlord must pay full cost to destroy your districts',
            'effect_School of Magic': 'Counts as any color for gold collection and color bonus',
            'effect_Library': 'When drawing cards, keep all of them',
            'effect_University': 'Worth 8 points instead of 6 in final scoring',
            'effect_Dragon Gate': 'Worth 8 points instead of 6 in final scoring',
            'effect_Imperial Treasury': '+1 point per gold you have at end of game',
            'effect_Map Room': '+1 point per card in hand at end of game',

            // Timer
            'time_left': '{seconds}s',

            // Phases
            'DraftPick': 'Draft',
            'PlayerTurn': 'Turn',
            'DrawChoice': 'Draw',
            'Ability': 'Ability',
            'GameOver': 'Game Over',
        },

        ru: {
            // Characters
            'Assassin': 'Ассасин',
            'Thief': 'Вор',
            'Magician': 'Чародей',
            'King': 'Король',
            'Bishop': 'Епископ',
            'Merchant': 'Купец',
            'Architect': 'Зодчий',
            'Warlord': 'Кондотьер',

            // Districts
            'Manor': 'Поместье',
            'Castle': 'Замок',
            'Palace': 'Дворец',
            'Temple': 'Храм',
            'Church': 'Церковь',
            'Monastery': 'Монастырь',
            'Cathedral': 'Собор',
            'Tavern': 'Таверна',
            'Trading Post': 'Фактория',
            'Market': 'Рынок',
            'Docks': 'Доки',
            'Harbor': 'Гавань',
            'Town Hall': 'Ратуша',
            'Watchtower': 'Дозорная башня',
            'Prison': 'Темница',
            'Battlefield': 'Поле битвы',
            'Fortress': 'Крепость',
            'Haunted City': 'Город Призраков',
            'Keep': 'Донжон',
            'Laboratory': 'Лаборатория',
            'Smithy': 'Кузня',
            'Observatory': 'Обсерватория',
            'Graveyard': 'Кладбище',
            'Great Wall': 'Великая стена',
            'School of Magic': 'Школа магии',
            'Library': 'Библиотека',
            'University': 'Университет',
            'Dragon Gate': 'Врата дракона',
            'Imperial Treasury': 'Имперская казна',
            'Map Room': 'Собрание карт',

            // Colors
            'Noble': 'Дворянский',
            'Religious': 'Церковный',
            'Trade': 'Торговый',
            'Military': 'Военный',
            'Special': 'Особый',

            // UI — home
            'home_title': 'Цитадели',
            'home_create': 'Создать игру',
            'home_join': 'Присоединиться по коду',
            'home_join_placeholder': 'Код игры',
            'home_join_btn': 'Войти',
            'home_browse': 'Найти игру',
            'home_browse_empty': 'Нет активных игр',
            'home_join_game': 'Войти',
            'leave_lobby': 'Выйти',

            // UI — common
            'citadels': 'Цитадели',
            'game_over': 'Игра окончена!',
            'gold': 'золото',
            'cards': 'карт',
            'no_game_id': 'Нет ID игры',

            // UI — lobby
            'lobby': 'Лобби',
            'scan_to_join': 'Отсканируйте QR-код чтобы войти в лобби!',
            'or_copy_link': 'Или скопируйте ссылку и отправьте друзьям',
            'follow_link': 'Перейдите по ссылке для входа в лобби:',
            'copy_link': 'Скопировать ссылку',
            'link_copied': 'Скопировано!',
            'game_label': 'Игра',
            'players_joined': 'игрок(ов) в игре',
            'waiting_for_players': 'Ожидание игроков...',
            'ready': 'Готов!',
            'not_ready': 'Не готов',
            'start_game': 'Начать игру',

            // UI — join
            'your_name': 'Ваше имя',
            'join_game': 'Войти в игру',

            // UI — draft
            'draft_phase': 'Фаза драфта',
            'round': 'Раунд',
            'face_up': 'Открытые',
            'available_chars': 'Доступно',
            'characters': 'персонажей',
            'picking': 'Выбирает',
            'choose_character': 'Выберите персонажа',
            'waiting_for_pick': 'Ожидание выбора других игроков...',

            // UI — turn
            'your_turn': 'Ваш ход!',
            'take_2_gold': 'Взять 2 золота',
            'draw_cards': 'Тянуть карты',
            'use_ability': 'Способность',
            'end_turn': 'Конец хода',
            'choose_target': 'Выберите цель',
            'build_district': 'Построить район (нажмите)',
            'hand': 'Рука',
            'city': 'Город',
            'waiting_playing': 'играет',
            'waiting': 'Ожидание...',
            'choose_card_keep': 'Выберите карту',
            'swap_hand': 'Обменяться рукой',
            'discard_draw': 'Сбросить и взять',
            'choose_player_swap': 'Выберите игрока для обмена',
            'choose_cards_discard': 'Выберите карты для сброса',
            'discard_and_draw': 'Сбросить и взять',
            'your_characters': 'Ваши персонажи',
            'lab_btn': 'Лаборатория',
            'lab_select_card': 'Выберите карту для сброса за 1 золото',
            'lab_cancel': 'Отмена',
            'smithy_btn': 'Кузня (2з → 3 карты)',
            'graveyard_prompt': 'Кладбище: Заплатить 1 золото, чтобы взять {district} ({cost}з) в руку?',
            'graveyard_accept': 'Принять',
            'graveyard_decline': 'Отклонить',

            // UI — deck
            'deck': 'Колода',

            // UI — scores
            'player': 'Игрок',
            'districts': 'Районы',
            'colors': 'Цвета',
            'complete': 'Полный',
            'special': 'Особые',
            'total': 'Итого',
            'pts': 'очк.',
            'exit_game': 'Выйти',

            // UI — table panel
            'table_title': 'Стол',

            // UI — collect gold
            'collect_gold': 'Собрать золото ({count})',

            // UI — event log
            'event_log': 'Журнал событий',

            // Events
            'ev_draft_start': 'Раунд {round} — Драфт начался',
            'ev_draft_pick': '{player} выбрал персонажа',
            'ev_draft_done': 'Драфт завершён — Начинается раунд',
            'ev_character_call': 'Вызывается #{number} {role}...{player}',
            'ev_murdered': '{role} ({player}) убит!',
            'ev_robbed': '{role} ({player}) ограблен на {stolen} золота вором {thief}!',
            'ev_gold_taken': '{player} взял {gold} золота',
            'ev_cards_drawn': '{player} взял {count} карт',
            'ev_district_built': '{player} построил {district} ({cost}з)',
            'ev_assassin_kill': '{player} (Ассасин) нацелился на {role}',
            'ev_thief_rob': '{player} (Вор) нацелился на {role}',
            'ev_magician_swap': '{player} (Чародей) обменялся рукой с {target}',
            'ev_magician_discard': '{player} (Чародей) сбросил {count} карт',
            'ev_merchant_bonus': '{player} (Купец) +1 бонусное золото',
            'ev_architect_draw': '{player} (Зодчий) взял {count} доп. карт',
            'ev_warlord_destroy': '{player} (Кондотьер) разрушил {district} у {target} за {cost}з',
            'ev_lab_discard': '{player}: Лаборатория — сбросил {district} за 1з',
            'ev_smithy_draw': '{player}: Кузня — 2з → {count} карт',
            'ev_graveyard_accept': '{player}: Кладбище — выкупил {district} за 1з',
            'ev_graveyard_decline': '{player}: Кладбище — отказался от {district}',
            'ev_gold_collected': '{player} собрал {count} золота ({color})',
            'ev_crown_passed': 'Корона перешла к {player}',
            'ev_turn_end': '{player} ({role}) завершил ход',
            'ev_round_end': 'Раунд {round} завершён',
            'ev_game_over': 'Игра окончена!',

            // District effects
            'effect_Haunted City': 'Считается любым цветом для бонуса за 5 цветов при подсчёте очков',
            'effect_Keep': 'Не может быть разрушен Кондотьером',
            'effect_Laboratory': 'Сбросить 1 карту из руки → получить 1 золото',
            'effect_Smithy': 'Заплатить 2 золота → взять 3 карты',
            'effect_Observatory': 'При взятии карт тянуть 3 вместо 2',
            'effect_Graveyard': 'Заплатить 1 золото, чтобы вернуть разрушенный район в руку',
            'effect_Great Wall': 'Кондотьер платит полную стоимость за разрушение ваших районов',
            'effect_School of Magic': 'Считается любым цветом для сбора золота и бонуса за цвета',
            'effect_Library': 'При взятии карт оставить все себе',
            'effect_University': 'Приносит 8 очков вместо 6 при подсчёте',
            'effect_Dragon Gate': 'Приносит 8 очков вместо 6 при подсчёте',
            'effect_Imperial Treasury': '+1 очко за каждое золото при подсчёте',
            'effect_Map Room': '+1 очко за каждую карту в руке при подсчёте',

            // Timer
            'time_left': '{seconds}с',

            // Phases
            'DraftPick': 'Драфт',
            'PlayerTurn': 'Ход',
            'DrawChoice': 'Выбор карт',
            'Ability': 'Способность',
            'GameOver': 'Конец игры',
        }
    };

    let currentLang = localStorage.getItem('citadels_lang') || 'ru';

    window.t = function(key, params) {
        const dict = translations[currentLang] || translations['en'];
        let str = dict[key] !== undefined ? dict[key] : (translations['en'][key] !== undefined ? translations['en'][key] : key);
        if (params) {
            Object.keys(params).forEach(function(k) {
                str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
            });
        }
        return str;
    };

    window.getLang = function() {
        return currentLang;
    };

    window.setLang = function(lang) {
        currentLang = lang;
        localStorage.setItem('citadels_lang', lang);
    };

    window.colorClass = function(color) {
        var numMap = { 1: 'color-noble', 2: 'color-religious', 3: 'color-trade', 4: 'color-military', 5: 'color-special' };
        var strMap = { Noble: 'color-noble', Religious: 'color-religious', Trade: 'color-trade', Military: 'color-military', Special: 'color-special' };
        return numMap[color] || strMap[color] || '';
    };

    window.langSwitcherHTML = function() {
        return '<div class="lang-switcher">' +
            '<span class="lang-option' + (currentLang === 'en' ? ' active' : '') + '" data-lang="en">EN</span>' +
            ' | ' +
            '<span class="lang-option' + (currentLang === 'ru' ? ' active' : '') + '" data-lang="ru">RU</span>' +
            '</div>';
    };

    window.districtEffect = function(name) {
        var key = 'effect_' + name;
        var dict = translations[currentLang] || translations['en'];
        if (dict[key] !== undefined) return dict[key];
        if (translations['en'][key] !== undefined) return translations['en'][key];
        return '';
    };

    window.bindLangSwitcher = function(onSwitch) {
        document.querySelectorAll('.lang-option').forEach(function(el) {
            el.onclick = function() {
                setLang(el.dataset.lang);
                if (onSwitch) onSwitch();
            };
        });
    };
})();
