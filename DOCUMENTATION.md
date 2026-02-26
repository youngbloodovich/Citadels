# Citadels — Digital Board Game: Technical Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Game Rules (Implemented)](#4-game-rules-implemented)
5. [Engine Layer — `internal/engine/`](#5-engine-layer--internalengine)
   - 5.1 [character.go — Characters](#51-charactergo--characters)
   - 5.2 [district.go — Districts](#52-districtgo--districts)
   - 5.3 [deck.go — Deck](#53-deckgo--deck)
   - 5.4 [player.go — Player State](#54-playergo--player-state)
   - 5.5 [config.go — Game Configuration](#55-configgo--game-configuration)
   - 5.6 [phase.go — Game Phases (State Machine)](#56-phasego--game-phases-state-machine)
   - 5.7 [ability.go — Abilities, Actions, Events](#57-abilitygo--abilities-actions-events)
   - 5.8 [abilities/ — Character Implementations](#58-abilities--character-implementations)
   - 5.9 [draft.go — Character Draft](#59-draftgo--character-draft)
   - 5.10 [resolve.go — Character Resolution](#510-resolvego--character-resolution)
   - 5.11 [game.go — Game Core](#511-gamego--game-core)
   - 5.12 [scoring.go — End-Game Scoring](#512-scoringgo--end-game-scoring)
   - 5.13 [engine_test.go — Tests](#513-engine_testgo--tests)
6. [Protocol Layer — `internal/protocol/`](#6-protocol-layer--internalprotocol)
   - 6.1 [envelope.go — Message Envelope](#61-envelopego--message-envelope)
   - 6.2 [messages.go — Message Types](#62-messagesgo--message-types)
7. [Lobby Layer — `internal/lobby/`](#7-lobby-layer--internallobby)
   - 7.1 [lobby.go — Single Lobby](#71-lobbygo--single-lobby)
   - 7.2 [manager.go — Multi-Lobby Manager](#72-managergo--multi-lobby-manager)
8. [Server Layer — `internal/server/`](#8-server-layer--internalserver)
   - 8.1 [client.go — WebSocket Client](#81-clientgo--websocket-client)
   - 8.2 [hub.go — Game Hub](#82-hubgo--game-hub)
   - 8.3 [handlers.go — HTTP Handlers](#83-handlersgo--http-handlers)
   - 8.4 [server.go — HTTP Server](#84-servergo--http-server)
   - 8.5 [session.go — Player Sessions](#85-sessiongo--player-sessions)
9. [QR Code — `internal/qrcode/`](#9-qr-code--internalqrcode)
10. [Entry Point — `main.go`](#10-entry-point--maingo)
11. [Frontend — `web/static/`](#11-frontend--webstatic)
    - 11.1 [ws.js — WebSocket Manager](#111-wsjs--websocket-manager)
    - 11.2 [tv.html + tv.js — TV Screen](#112-tvhtml--tvjs--tv-screen)
    - 11.3 [player.html + player.js — Phone Controller](#113-playerhtml--playerjs--phone-controller)
    - 11.4 [lobby.html — QR Landing Page](#114-lobbyhtml--qr-landing-page)
    - 11.5 [CSS — Styles](#115-css--styles)
12. [Data Flow](#12-data-flow)
13. [WebSocket Protocol Reference](#13-websocket-protocol-reference)
14. [Build, Run, Test](#14-build-run-test)
15. [Extensibility](#15-extensibility)
16. [Go Concepts Used](#16-go-concepts-used)

---

## 1. Overview

Citadels (Цитадели) is a classic board game for 2–7 players, implemented as a web application with a "TV + Phones" architecture:

- **TV** (large screen / monitor): displays the public game board — players' cities, gold, card counts, draft status, character calls, and final scores. Connects via WebSocket and receives only public information.
- **Phones** (each player's device): serve as personal controllers. Each player sees their private hand, chooses characters during the draft, takes actions during their turn, and uses abilities. Connects via WebSocket with a player ID.
- **QR Code**: generated server-side as a PNG. The TV screen shows it so players can scan it with their phone cameras and jump straight into the game lobby.

Everything is a **single Go binary**. No Node.js, no npm, no webpack. Frontend files (HTML, CSS, JS) are embedded into the binary at compile time using `//go:embed`. The server handles both HTTP (serving static files, API endpoints) and WebSocket (real-time game communication).

### Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | Go 1.25 |
| WebSocket | `github.com/gorilla/websocket` |
| QR Code | `github.com/skip2/go-qrcode` |
| Frontend | Vanilla JavaScript (no frameworks, no bundlers) |
| Static Embedding | `//go:embed` (Go standard library) |
| Communication | JSON over WebSocket |

---

## 2. Architecture

### 2.1 Layered Design

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                            │
│  TV (tv.html/tv.js)    Phone (player.html/player.js)    │
│         │                        │                       │
│         └──── WebSocket ─────────┘                       │
├─────────────────────────────────────────────────────────┤
│                   Server Layer                           │
│  HTTP routes │ WebSocket Hub │ Client read/write pumps   │
│  (server.go)   (hub.go)       (client.go)                │
├─────────────────────────────────────────────────────────┤
│                   Protocol Layer                         │
│  Envelope {type, payload}  │  Message type constants     │
│  (envelope.go)               (messages.go)               │
├─────────────────────────────────────────────────────────┤
│                   Lobby Layer                            │
│  Room management │ Join/Leave/Ready │ Multi-lobby         │
│  (lobby.go)        (lobby.go)        (manager.go)        │
├─────────────────────────────────────────────────────────┤
│                   Engine Layer (ZERO I/O)                │
│  Game state │ Apply(action) → events │ Views             │
│  Characters │ Abilities │ Draft │ Scoring                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Key Design Principle: Pure Engine

The engine (`internal/engine/`) has **zero I/O**. It doesn't know about WebSockets, HTTP, JSON, or any network layer. It's a pure state machine:

```
Input:  Game.Apply(playerID string, action Action)
Output: ([]Event, error)
```

This makes the engine:
- **Testable**: unit tests don't need network setup
- **Deterministic**: same input → same output (except shuffling)
- **Reusable**: could be used with a different transport (TCP, gRPC, etc.)

The server layer translates between WebSocket messages and engine actions/events.

### 2.3 Connection Types

| Connection | Direction | Data |
|-----------|-----------|------|
| TV → Server | WebSocket | Receives: `game_state`, `lobby_update`, `event` |
| Phone → Server | WebSocket | Sends: `join`, `ready`, `draft_pick`, `build`, etc. |
| Phone ← Server | WebSocket | Receives: `player_state`, `lobby_update`, `event`, `error` |

TV never sends game actions — it's a passive display. Phones send actions and receive both public state and their private state (hand, characters).

---

## 3. Project Structure

```
citadels/
│
├── main.go                           # Entry point. Embeds static files, starts server.
├── go.mod                            # Module definition: "citadels", Go 1.25
├── go.sum                            # Dependency checksums (auto-generated)
│
├── internal/                         # Private packages (Go convention: can't be imported
│   │                                 #   by code outside this module)
│   │
│   ├── engine/                       # Pure game logic — NO network, NO I/O
│   │   ├── character.go              # CharacterRole type (1-8), names, color mapping
│   │   ├── district.go               # District struct, DistrictColor, 62-card base deck
│   │   ├── deck.go                   # Deck: shuffle, draw, return, peek
│   │   ├── player.go                 # Player: gold, hand, city, crown, per-turn state
│   │   ├── config.go                 # GameConfig: district pool, end-game city size
│   │   ├── phase.go                  # GamePhase enum: Lobby→Draft→Resolution→Turn→GameOver
│   │   ├── ability.go                # Ability interface, Action/Event types, AbilityRegistry
│   │   ├── draft.go                  # Draft setup and picking for 2-7 players
│   │   ├── resolve.go                # Character calling (1-8), murder/robbery resolution
│   │   ├── game.go                   # Game struct, Apply(), StartGame(), PublicView(), ViewFor()
│   │   ├── scoring.go                # End-game score calculation
│   │   ├── engine_test.go            # Unit tests (9 tests)
│   │   │
│   │   └── abilities/                # One file per character's ability implementation
│   │       ├── assassin.go           # Murder a character
│   │       ├── thief.go              # Rob a character's gold
│   │       ├── magician.go           # Swap hand or discard/redraw
│   │       ├── king.go               # Receive crown (passive)
│   │       ├── bishop.go             # Protected from Warlord (passive)
│   │       ├── merchant.go           # +1 bonus gold (passive)
│   │       ├── architect.go          # Draw 2 extra, build up to 3 (passive)
│   │       └── warlord.go            # Destroy a district for (cost-1) gold
│   │
│   ├── protocol/                     # WebSocket message format
│   │   ├── envelope.go               # Envelope: {type: string, payload: JSON}
│   │   └── messages.go               # All message type constants + payload structs
│   │
│   ├── lobby/                        # Pre-game room management
│   │   ├── lobby.go                  # Single lobby: join, leave, ready, start
│   │   └── manager.go                # Multiple lobbies, ID generation
│   │
│   ├── server/                       # Network layer
│   │   ├── server.go                 # HTTP mux, static file serving, ListenAndServe
│   │   ├── hub.go                    # Per-game WebSocket hub (routes messages ↔ engine)
│   │   ├── client.go                 # WebSocket client: read/write pumps, ping/pong
│   │   ├── handlers.go               # HTTP handlers: create game, QR, WS upgrade
│   │   └── session.go                # Player ID generation
│   │
│   └── qrcode/
│       └── qrcode.go                 # QR code PNG generation
│
└── web/static/                       # Frontend (embedded into binary via //go:embed)
    ├── css/
    │   ├── common.css                # Shared theme: dark background, gold accents
    │   ├── tv.css                    # TV layout: player grid, QR section, score table
    │   └── player.css                # Phone layout: hand cards, action buttons, drafting
    ├── js/
    │   ├── ws.js                     # WebSocket wrapper with auto-reconnect
    │   ├── tv.js                     # TV screen logic: lobby → game → scores
    │   └── player.js                 # Phone controller: join → lobby → draft → play → scores
    ├── tv.html                       # TV screen HTML shell
    ├── player.html                   # Phone controller HTML shell
    └── lobby.html                    # QR landing page (same as player.html)
```

---

## 4. Game Rules (Implemented)

### 4.1 Overview

Players are city builders competing to build the most impressive city. Each round:
1. **Draft**: players secretly choose character roles from a pool of 8
2. **Resolution**: characters are called in order (1→8), and each player takes their turn
3. **Build**: players collect resources and build district cards into their city
4. **End**: when someone builds their 7th district, the round completes and scores are tallied

### 4.2 Characters (1-8)

| # | Character | Ability | Passive Effects |
|---|-----------|---------|-----------------|
| 1 | Assassin | Choose a character to murder (they skip their turn) | — |
| 2 | Thief | Choose a character to rob (steal all their gold when called) | — |
| 3 | Magician | Swap hand with another player OR discard cards and redraw | — |
| 4 | King | — | Receives the crown (picks first next round). Collects gold for Noble (yellow) districts |
| 5 | Bishop | — | Protected from Warlord. Collects gold for Religious (blue) districts |
| 6 | Merchant | — | Gets +1 bonus gold. Collects gold for Trade (green) districts |
| 7 | Architect | — | Draws 2 extra cards. Can build up to 3 districts (instead of 1) |
| 8 | Warlord | Destroy one district in another player's city by paying (cost − 1) gold | Collects gold for Military (red) districts |

### 4.3 District Colors

| Color | Type | Associated Character |
|-------|------|---------------------|
| Yellow | Noble | King (#4) |
| Blue | Religious | Bishop (#5) |
| Green | Trade | Merchant (#6) |
| Red | Military | Warlord (#8) |
| Purple | Special | No character (unique effects) |

### 4.4 Special Purple Districts

| District | Cost | Effect |
|----------|------|--------|
| Haunted City | 2 | Can be built even if you already have one |
| Keep | 3 | Cannot be destroyed by the Warlord |
| Laboratory | 5 | Once per turn: discard a card from hand → gain 1 gold |
| Smithy | 5 | Once per turn: pay 2 gold → draw 3 cards |
| Observatory | 5 | When drawing cards: draw 3 instead of 2 |
| Graveyard | 5 | When Warlord destroys your district: pay 1 gold to take it into hand |
| School of Magic | 6 | Counts as any color for gold collection and 5-color bonus |
| Library | 6 | When drawing cards: keep all drawn cards (don't discard) |
| University | 6 | Worth 8 points instead of 6 at end of game |
| Dragon Gate | 6 | Worth 8 points instead of 6 at end of game |

### 4.5 Turn Structure

Each player's turn (during Resolution phase):

1. **Mandatory action** (choose one):
   - Take 2 gold from the bank
   - Draw 2 cards from the deck, keep 1 (affected by Observatory/Library)

2. **Build** (optional):
   - Play a district card from hand, pay its gold cost
   - Card goes into your city
   - Normally limited to 1 per turn (Architect: up to 3)
   - Cannot build a duplicate of a district already in your city

3. **Use ability** (optional, if character has an active ability):
   - Assassin, Thief, Magician, Warlord have active abilities
   - Can be used before or after building

4. **End turn**

### 4.6 Draft Rules by Player Count

| Players | Face-down (hidden) | Face-up (visible) | Picks per player |
|---------|-------------------|-------------------|-----------------|
| 2 | 1 | 0 | 2 (alternating) |
| 3 | 1 | 0 | 2 (alternating) |
| 4 | 1 | 2 | 1 |
| 5 | 1 | 1 | 1 |
| 6 | 1 | 0 | 1 |
| 7 | 1 | 0 | 1 |

The player with the crown picks first, then clockwise.

### 4.7 Scoring

When a player builds their 7th district (configurable), the current round is the final round. After all characters are resolved, scores are calculated:

| Bonus | Points | Condition |
|-------|--------|-----------|
| District costs | Sum | Total cost of all built districts |
| All 5 colors | +3 | City contains at least one of each color |
| First to complete | +4 | First player to reach 7 districts |
| Also completed | +2 | Other players who also reached 7 districts |
| University | +2 | Worth 8 instead of 6 |
| Dragon Gate | +2 | Worth 8 instead of 6 |

### 4.8 Game State Machine

```
PhaseLobby
    │ (all players ready, host clicks "Start Game")
    ▼
PhaseDraftPick ◄──────────────────────────┐
    │ (all players have picked characters)  │
    ▼                                       │
PhaseResolution                             │
    │ (call characters 1→8)                 │
    ▼                                       │
PhasePlayerTurn ◄──┐                        │
    │              │ (ability needs input)   │
    ▼              │                         │
PhaseAbility ──────┘                        │
    │                                       │
PhaseDrawChoice ──► PhasePlayerTurn         │
    │ (player chose card)                   │
    │                                       │
    │ (player ends turn → next character)   │
    │ (all 8 called, NOT final round) ──────┘
    │ (all 8 called, IS final round)
    ▼
PhaseGameOver
```

---

## 5. Engine Layer — `internal/engine/`

The engine is the heart of the application. It contains all game logic and **zero I/O**. It doesn't import `net`, `net/http`, `encoding/json` (except for struct tags), or any network package.

### 5.1 `character.go` — Characters

**Purpose**: Defines the 8 character roles as a type-safe enum.

```go
type CharacterRole int

const (
    RoleAssassin  CharacterRole = 1
    RoleThief     CharacterRole = 2
    // ...
    RoleWarlord   CharacterRole = 8
)
```

**Why `int` and not `iota`?** The numbers 1-8 are meaningful in Citadels — characters are always called in this exact order. Using explicit values makes the code match the game rules.

**Key methods:**
- `String()` — returns human-readable name ("Assassin", "King", etc.). Used in JSON output and UI.
- `Color()` — maps character to their associated district color. King→Noble, Bishop→Religious, Merchant→Trade, Warlord→Military. Other characters return `ColorNone`.
- `AllRoles()` — returns a slice of all 8 roles in order. Used in draft setup and resolution.

**Go concepts:**
- `type CharacterRole int` — custom type based on `int`. Prevents mixing with plain integers.
- Method with value receiver `(r CharacterRole)` — read-only, works on a copy.
- `map[CharacterRole]string` — hash map for fast name lookup.

---

### 5.2 `district.go` — Districts

**Purpose**: Defines district cards — the building blocks of players' cities.

```go
type DistrictColor int  // 0=None, 1=Noble, 2=Religious, 3=Trade, 4=Military, 5=Special

type District struct {
    Name  string        `json:"name"`
    Color DistrictColor `json:"color"`
    Cost  int           `json:"cost"`
}
```

**`BaseDistricts()`** returns the standard 62-card deck:
- 12 Noble (yellow): Manor(3)×5, Castle(4)×4, Palace(5)×3
- 11 Religious (blue): Temple(1)×3, Church(2)×3, Monastery(3)×3, Cathedral(5)×2
- 17 Trade (green): Tavern(1)×5, Trading Post(2)×3, Market(2)×3, Docks(3)×3, Harbor(4)×2, Town Hall(5)×1
- 11 Military (red): Watchtower(1)×3, Prison(2)×3, Battlefield(3)×3, Fortress(5)×2
- 11 Special (purple): each unique with special effects

**Go concepts:**
- Struct tags `` `json:"name"` `` control JSON serialization. Field `Name` becomes `"name"` in JSON.
- Anonymous function `add := func(n int, ...) { ... }` captures `cards` variable from outer scope (closure).
- `append(cards, District{...})` — adds to a dynamically-growing slice.

---

### 5.3 `deck.go` — Deck

**Purpose**: A shuffleable stack of district cards.

```go
type Deck struct {
    cards []District  // unexported field — only accessible within package
}
```

**Methods:**
- `NewDeck(cards)` — creates a shuffled copy of the input cards
- `Shuffle()` — Fisher-Yates shuffle using `math/rand/v2`
- `Draw(n)` — removes and returns top n cards (returns fewer if deck is short)
- `Return(cards)` — puts cards at the bottom
- `Len()` — cards remaining
- `Peek(n)` — look at top n without removing

**Go concepts:**
- `*Deck` (pointer receiver) — methods modify the original deck, not a copy.
- `make([]District, n)` — allocates a slice with specified length.
- `copy(dst, src)` — copies elements between slices.
- `d.cards[:n]` / `d.cards[n:]` — slice expressions (sub-slices). They share underlying array.
- Lowercase `cards` field — unexported (private to the package). Outside code can only use methods.

---

### 5.4 `player.go` — Player State

**Purpose**: Holds everything about one player.

```go
type Player struct {
    ID         string          `json:"id"`
    Name       string          `json:"name"`
    Gold       int             `json:"gold"`
    Hand       []District      `json:"hand"`       // private cards
    City       []District      `json:"city"`        // built districts (public)
    Characters []CharacterRole `json:"characters"`  // picked this round
    HasCrown   bool            `json:"has_crown"`

    // Per-turn state (not serialized to JSON)
    Murdered    bool `json:"-"`  // killed by Assassin
    Robbed      bool `json:"-"`  // robbed by Thief
    BuiltCount  int  `json:"-"`  // districts built this turn
    TookAction  bool `json:"-"`  // already took gold/drew cards
    UsedAbility bool `json:"-"`  // already used ability
}
```

**Key methods:**
- `CityHas(name)` — checks if a named district is in the city (used for special effects and duplicate prevention)
- `CityColorCount(color)` — counts districts of a color (handles School of Magic counting as any color)
- `HasAllColors()` — checks for 5-color bonus (handles School of Magic as wildcard)
- `RemoveFromHand(name)` — removes a card by name, returns it. Returns `(District, bool)` — the Go pattern for "found or not"

**Go concepts:**
- `json:"-"` tag — field is excluded from JSON. Per-turn state is internal bookkeeping.
- `(District, bool)` multiple return values — idiomatic Go for "result + found/error".
- Deletion from slice: `p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)` — concatenates "before i" and "after i".

---

### 5.5 `config.go` — Game Configuration

**Purpose**: Settings that can vary between games (for extensibility).

```go
type GameConfig struct {
    Districts   []District  // card pool to build the deck from
    EndCitySize int         // districts to trigger end game (default: 7)
}
```

`DefaultConfig()` returns the standard setup. For house rules or expansions, you could create a different config with modified deck or end-game threshold.

---

### 5.6 `phase.go` — Game Phases (State Machine)

**Purpose**: Defines the phases the game can be in.

```go
type GamePhase int

const (
    PhaseLobby      GamePhase = iota  // = 0
    PhaseDraftSetup                    // = 1
    PhaseDraftPick                     // = 2
    PhaseResolution                    // = 3
    PhasePlayerTurn                    // = 4
    PhaseAbility                       // = 5
    PhaseDrawChoice                    // = 6
    PhaseGameOver                      // = 7
)
```

**Go concepts:**
- `iota` — auto-incrementing constant generator. First value = 0, each subsequent += 1. Go's approach to enums.
- `String()` method — converts phase to human-readable name for JSON/debugging.

---

### 5.7 `ability.go` — Abilities, Actions, Events

**Purpose**: Defines the core interfaces and types for the game's action system.

#### Actions (input from players)

```go
type ActionType string

const (
    ActionDraftPick  ActionType = "draft_pick"
    ActionTakeGold   ActionType = "take_gold"
    ActionDrawCards   ActionType = "draw_cards"
    ActionKeepCard   ActionType = "keep_card"
    ActionBuild      ActionType = "build"
    ActionAbility    ActionType = "ability"
    ActionEndTurn    ActionType = "end_turn"
    ActionLabDiscard ActionType = "lab_discard"
    ActionSmithyDraw ActionType = "smithy_draw"
)
```

An `Action` struct carries all possible parameters:

```go
type Action struct {
    Type         ActionType    // which action
    Character    CharacterRole // for draft_pick, ability targeting
    DistrictName string        // for build, lab_discard, warlord target
    Target       string        // player ID for ability targeting
    Index        int           // for keep_card (which drawn card to keep)
    ExtraData    string        // for magician mode ("swap_hand" / "discard_draw")
    Indices      []int         // for magician (which cards to discard)
}
```

Not all fields are used for every action. `omitempty` tags mean unused fields are absent from JSON.

#### Events (output from engine)

```go
type Event struct {
    Type   EventType   // what happened
    Player string      // who it happened to (optional)
    Data   interface{} // extra data (varies by event type)
}
```

Events are broadcast to all clients after each action. The server converts them to WebSocket messages.

#### Ability Interface

```go
type Ability interface {
    Role() CharacterRole
    NeedsTarget() bool
    IsPassive() bool
    ValidTargets(g *Game, playerID string) []string
    Apply(g *Game, playerID string, action Action) ([]Event, error)
}
```

This is the **polymorphism mechanism** in Go. Any struct that implements these 5 methods automatically satisfies the `Ability` interface. No `implements` keyword needed — this is called **structural typing** (duck typing).

#### AbilityRegistry

```go
type AbilityRegistry struct {
    abilities map[CharacterRole]Ability
}
```

Maps role numbers to their ability implementations. This makes the system **extensible**: to add a new character, implement the `Ability` interface and call `registry.Register(myNewAbility{})`.

---

### 5.8 `abilities/` — Character Implementations

Each file in `internal/engine/abilities/` implements the `Ability` interface for one character. They live in a separate package (`abilities`) from the engine (`engine`), which is a design choice: it keeps the engine package clean and allows adding new characters without modifying existing files.

#### `assassin.go` (Role 1)

```go
type Assassin struct{}  // empty struct, no state needed
```

- `NeedsTarget()` → `true` (must choose which character to murder)
- `IsPassive()` → `false` (player actively uses this)
- `ValidTargets()` → all roles except Assassin (can't kill yourself)
- `Apply()` → sets `g.MurderedRole = targetRole`. When that character is called later, they're skipped.

#### `thief.go` (Role 2)

- `ValidTargets()` → all roles except Assassin, Thief, and the murdered role
- `Apply()` → sets `g.RobbedRole = targetRole`. When that character is called, their gold is transferred.

#### `magician.go` (Role 3)

Two modes selected via `action.ExtraData`:
- `"swap_hand"` → swaps entire hand with target player
- `"discard_draw"` → discards selected cards (`action.Indices`), draws same number

Implementation handles:
- Index validation and deduplication
- Sorting indices descending for correct removal
- Returning discarded cards to deck bottom

#### `king.go` (Role 4) — Passive

- `Apply()` → transfers crown to this player. Crown determines draft order next round.
- Gold collection for Noble districts is handled separately in `resolve.go`.

#### `bishop.go` (Role 5) — Passive

- `Apply()` → does nothing (returns nil). Both effects (gold collection and Warlord protection) are checked elsewhere.
- Gold collection: `resolve.go`
- Warlord protection: `warlord.go` checks `PlayerHasActiveRole(targetID, RoleBishop)`.

#### `merchant.go` (Role 6) — Passive

- `Apply()` → `player.Gold++` (1 bonus gold at start of turn)
- Gold collection for Trade districts: `resolve.go`

#### `architect.go` (Role 7) — Passive

- `Apply()` → draws 2 extra cards from deck into hand
- Build limit of 3 is checked in `game.go`'s `applyBuild()` method

#### `warlord.go` (Role 8)

The most complex ability:
- `ValidTargets()` → finds destroyable districts in other players' cities. Excludes:
  - Bishop's city (protected)
  - Completed cities (7+ districts)
  - "Keep" districts (indestructible)
  - Districts too expensive for the Warlord to afford (cost - 1 > gold)
- `Apply()` → removes district from target's city, deducts gold. If target has Graveyard, sets `g.PendingGraveyard` for follow-up.

Target format: `"playerID:districtName"` (compound string parsed by the ability).

---

### 5.9 `draft.go` — Character Draft

**Purpose**: Manages the character selection phase at the start of each round.

#### DraftState

```go
type DraftState struct {
    Available      []CharacterRole           // characters still pickable
    FaceUp         []CharacterRole           // revealed, not pickable (public info)
    FaceDown       []CharacterRole           // hidden, not pickable (secret)
    CurrentPicker  int                       // index into PickOrder
    PickOrder      []string                  // player IDs in pick sequence
    PicksPerPlayer int                       // 1 for 4-7 players, 2 for 2-3
    Picks          map[string][]CharacterRole // accumulated picks
}
```

#### `SetupDraft(players)`

1. Takes all 8 roles, shuffles them randomly
2. Takes `faceDown` cards off the top (hidden from everyone — adds uncertainty)
3. Takes `faceUp` cards (visible to everyone — limits options)
4. Remaining cards are `Available` for picking
5. Determines pick order starting from crown holder, going clockwise
6. For 2-3 players: expands pick order so each player picks twice (interleaved)

#### `Pick(playerID, role)`

1. Validates it's the correct player's turn
2. Validates the role is in the Available pool
3. Removes role from Available, adds to player's Picks
4. Advances to next picker

#### Draft Rules Table

| Players | 8 roles - faceDown - faceUp = Available | Each picks |
|---------|----------------------------------------|------------|
| 2 | 8 - 1 - 0 = 7 → pick 2 each (4 picked, 3 left over) | 2 |
| 3 | 8 - 1 - 0 = 7 → pick 2 each (6 picked, 1 left over) | 2 |
| 4 | 8 - 1 - 2 = 5 → pick 1 each (4 picked, 1 left over) | 1 |
| 5 | 8 - 1 - 1 = 6 → pick 1 each (5 picked, 1 left over) | 1 |
| 6 | 8 - 1 - 0 = 7 → pick 1 each (6 picked, 1 left over) | 1 |
| 7 | 8 - 1 - 0 = 7 → pick 1 each (7 picked, 0 left over) | 1 |

---

### 5.10 `resolve.go` — Character Resolution

**Purpose**: After the draft, characters are called in order 1→8. This file handles that process.

#### `NextCharacterToCall()`

Returns the next role number greater than `CurrentCallRole`, or 0 if all have been called.

#### `CallCharacter(role)`

The main resolution function. For each character:

1. **Announce**: emit `EventCharacterCall`
2. **Find owner**: search all players' character lists. If nobody picked this role → skip.
3. **Murder check**: if this role was murdered by the Assassin, emit `EventMurdered` and skip.
4. **Robbery check**: if this role was marked by the Thief, transfer all gold from this player to the Thief. Emit `EventRobbed`.
5. **Passive abilities**: if the character has passive abilities (King, Bishop, Merchant, Architect), apply them now.
6. **Gold collection**: if the character has an associated color, count matching districts in the player's city and add that many gold.
7. **Set up turn**: mark this player as the current turn player, reset turn-state flags, change phase to `PhasePlayerTurn`.

#### `FindCharacterOwner(role)`

Searches all players' `Characters` slices. Returns the player ID or `""`.

#### `PlayerHasActiveRole(playerID, role)`

Returns true only if the player has the role AND is not murdered. Used by Warlord to check Bishop protection.

---

### 5.11 `game.go` — Game Core

**Purpose**: The central Game struct and the `Apply()` method — the single entry point for all game mutations.

#### Game Struct

```go
type Game struct {
    Players           []*Player         // all players
    Deck              *Deck             // district card deck
    Config            GameConfig        // game settings
    Abilities         *AbilityRegistry  // character ability implementations

    Phase             GamePhase         // current game phase
    Round             int               // round number (increments each draft)
    CurrentCallRole   CharacterRole     // which character is being called (1-8)
    CurrentTurnPlayer string            // player ID of active player
    CurrentTurnRole   CharacterRole     // which character the active player is using

    MurderedRole      CharacterRole     // set by Assassin
    RobbedRole        CharacterRole     // set by Thief

    Draft             *DraftState       // active draft (nil outside draft phase)

    FinalRound        bool              // true if end-game triggered
    FirstToComplete   string            // player ID who first reached 7 districts

    DrawnCards        []District        // cards drawn during draw action (for choosing)
    DrawCount         int               // how many to keep

    PendingGraveyard  *GraveyardPending // pending Graveyard response

    Scores            []ScoreEntry      // final scores (only after GameOver)
}
```

#### `NewGame(players, config, abilities)`

Creates a new game in `PhaseLobby`.

#### `StartGame()`

1. Deals 4 cards to each player
2. Gives 2 gold to each player
3. Gives the crown to player 0
4. Calls `startDraft()` to begin the first round

#### `startDraft()`

1. Increments round counter
2. Resets per-round state (murdered/robbed roles, player flags)
3. Calls `SetupDraft()` to create draft state
4. Sets phase to `PhaseDraftPick`
5. Returns draft start events

#### `Apply(playerID, action)` — THE CORE METHOD

This is the **Command Pattern**. Every player action goes through this single method:

```go
func (g *Game) Apply(playerID string, action Action) ([]Event, error)
```

It dispatches based on `action.Type`:

| ActionType | Handler | Phase Required |
|-----------|---------|---------------|
| `draft_pick` | `applyDraftPick` | DraftPick |
| `take_gold` | `applyTakeGold` | PlayerTurn |
| `draw_cards` | `applyDrawCards` | PlayerTurn |
| `keep_card` | `applyKeepCard` | DrawChoice |
| `build` | `applyBuild` | PlayerTurn |
| `ability` | `applyAbility` | PlayerTurn or Ability |
| `end_turn` | `applyEndTurn` | PlayerTurn |
| `lab_discard` | `applyLabDiscard` | PlayerTurn |
| `smithy_draw` | `applySmithyDraw` | PlayerTurn |

Each handler:
1. **Validates phase** — returns `ErrWrongPhase` if action doesn't match current phase
2. **Validates player** — returns `ErrNotYourTurn` if it's not this player's turn
3. **Validates action** — checks resources, targets, limits
4. **Mutates state** — changes game state
5. **Returns events** — list of events to broadcast

#### Action Handlers (detailed)

**`applyDraftPick`**: Delegates to `Draft.Pick()`. If draft is complete, assigns characters to players and starts resolution (`resolveNext()`).

**`applyTakeGold`**: Adds 2 gold. Sets `TookAction = true` (can only take gold OR draw cards, not both).

**`applyDrawCards`**: Draws cards from deck. Normally draws 2, keeps 1 (player must choose). Observatory → draw 3. Library → keep all. If player must choose, changes phase to `PhaseDrawChoice` and stores drawn cards in `g.DrawnCards`.

**`applyKeepCard`**: Player selects which drawn card to keep (by index). Returns unchosen cards to deck. Phase returns to `PhasePlayerTurn`.

**`applyBuild`**: Removes card from hand, deducts gold, adds to city. Checks: card in hand, enough gold, no duplicate in city (except Haunted City), build limit (1 normally, 3 for Architect). Checks end-game trigger (7 districts).

**`applyAbility`**: Delegates to the character's `Ability.Apply()`. Validates the ability isn't passive and hasn't been used already.

**`applyEndTurn`**: Ends the current player's turn. Changes phase back to Resolution and calls `resolveNext()` to process the next character.

**`applyLabDiscard`**: Laboratory special effect. Discards a hand card, gains 1 gold. Validates player has Laboratory built.

**`applySmithyDraw`**: Smithy special effect. Pays 2 gold, draws 3 cards. Validates player has Smithy built and enough gold.

#### Round Flow

`resolveNext()` → `CallCharacter()` → player takes turn → `applyEndTurn()` → `resolveNext()` → ... → all 8 called → `endRound()` → if final round → `endGame()`, else → `startDraft()`.

#### Views

**`PublicView()`** — returns data safe for the TV:
- Player names, gold, hand SIZE (not contents), city, crown status
- Revealed roles (only for characters already called this round)
- Draft face-up cards, current picker name
- Phase, round, deck size, scores

**`ViewFor(playerID)`** — returns public view PLUS private data for one player:
- Full hand contents
- Character names
- Whether it's their turn
- What actions are available (can build, can use ability, etc.)
- Draft choices (available characters to pick)
- Draw choices (drawn cards to keep)
- Valid targets for abilities

---

### 5.12 `scoring.go` — End-Game Scoring

**Purpose**: Calculates final scores when the game ends.

```go
type ScoreEntry struct {
    PlayerID      string
    PlayerName    string
    DistrictScore int   // sum of district costs
    ColorBonus    int   // +3 if all 5 colors
    FirstComplete int   // +4 if first to complete
    OtherComplete int   // +2 if also completed
    SpecialBonus  int   // University +2, Dragon Gate +2
    Total         int   // sum of all above
}
```

**`CalculateScores()`** iterates over all players and computes each component:
1. Sum all district costs
2. Check `HasAllColors()` for the 5-color bonus
3. Check `FirstToComplete` for the completion bonus
4. Check for University and Dragon Gate special bonuses
5. Sum everything

---

### 5.13 `engine_test.go` — Tests

**Purpose**: Unit tests for the engine. Uses Go's built-in testing framework.

| Test | What it verifies |
|------|-----------------|
| `TestNewGame` | 4 players created, phase is Lobby |
| `TestStartGame` | Phase becomes DraftPick, each player has 4 cards and 2 gold, first player has crown |
| `TestDraftConfig` | Correct face-down/face-up/picks for all player counts (2-7) |
| `TestDraftAndResolve` | Full 4-player draft completes, game advances to Resolution/PlayerTurn |
| `TestTakeGoldAndBuild` | Taking gold adds 2, building deducts cost and places card in city |
| `TestScoring` | Correct scoring: district costs + 5-color bonus + first complete + University |
| `TestDeck` | Draw removes cards, Return adds them back, correct lengths |
| `TestBaseDistricts` | Deck has exactly 62 cards |
| `TestCharacterRoleString` | Role names convert correctly |

**Go testing concepts:**
- File name `*_test.go` — excluded from production build
- Package `engine_test` (not `engine`) — black-box testing, only sees exported names
- `func TestXxx(t *testing.T)` — test function signature
- `t.Fatalf()` — fail and stop test
- `t.Errorf()` — fail but continue test
- Run with: `go test ./internal/engine/... -v`

---

## 6. Protocol Layer — `internal/protocol/`

### 6.1 `envelope.go` — Message Envelope

All WebSocket messages use a standard envelope format:

```json
{
    "type": "draft_pick",
    "payload": { "character": 3 }
}
```

```go
type Envelope struct {
    Type    string          `json:"type"`
    Payload json.RawMessage `json:"payload,omitempty"`
}
```

**`json.RawMessage`** is a special type — it's raw JSON bytes that aren't parsed yet. This allows the outer envelope to be parsed without knowing the payload structure. The payload is parsed later based on `Type`.

Helper functions:
- `NewEnvelope(typ, payload)` — creates an envelope, marshaling the payload to JSON
- `MustEnvelope(typ, payload)` — same but panics on error (used when marshaling is guaranteed to succeed)

### 6.2 `messages.go` — Message Types

Defines all message type constants as string constants:

**Server → Client:**
- `lobby_update` — lobby state changed (player joined/left/readied)
- `game_state` — full public game state (for TV)
- `player_state` — full private game state (for phone)
- `event` — a game event occurred
- `error` — error message

**Client → Server:**
- `join` — join the game with player ID and name
- `ready` — toggle ready state
- `start_game` — start the game (all must be ready)
- `draft_pick`, `take_gold`, `draw_cards`, `keep_card`, `build`, `ability`, `end_turn`, `lab_discard`, `smithy_draw` — in-game actions (same names as `ActionType`)

Also defines payload structs for structured messages (`JoinMsg`, `ReadyMsg`, `LobbyUpdate`, etc.).

---

## 7. Lobby Layer — `internal/lobby/`

### 7.1 `lobby.go` — Single Lobby

**Purpose**: Manages a game room before the game starts.

```go
type Lobby struct {
    mu         sync.Mutex     // protects concurrent access
    ID         string
    Players    []*PlayerInfo
    MaxPlayers int            // 7
    MinPlayers int            // 2
    Started    bool
}
```

**Methods:**
- `Join(id, name)` — adds player (or updates name if rejoining). Rejects if full or started.
- `Leave(id)` — removes player
- `SetReady(id, ready)` — toggles ready state
- `CanStart()` — true if enough players (≥2) and all are ready
- `Start()` — marks lobby as started (irreversible)
- `GetPlayers()` — returns a copy of the player list (safe for concurrent use)

**`sync.Mutex`**: all methods lock/unlock the mutex to prevent data races when multiple goroutines (WebSocket connections) access the lobby simultaneously.

### 7.2 `manager.go` — Multi-Lobby Manager

**Purpose**: Manages multiple concurrent game lobbies.

```go
type Manager struct {
    mu      sync.Mutex
    lobbies map[string]*Lobby
}
```

- `Create()` — generates a random 8-character hex ID, creates a new lobby
- `Get(id)` — returns lobby by ID

---

## 8. Server Layer — `internal/server/`

### 8.1 `client.go` — WebSocket Client

**Purpose**: Represents a single WebSocket connection (one TV or one phone).

```go
type Client struct {
    hub      *Hub              // the game hub this client belongs to
    conn     *websocket.Conn   // the actual WebSocket connection
    send     chan []byte        // buffered channel of outbound messages
    PlayerID string            // player ID (empty for TV)
    Type     ClientType        // ClientTV or ClientPlayer
}
```

#### Read/Write Pump Pattern

Each client runs two goroutines:

**ReadPump** (goroutine 1): Reads from WebSocket → parses JSON → sends to hub's incoming channel.
```
WebSocket → ReadMessage() → json.Unmarshal → hub.incoming <- message
```

**WritePump** (goroutine 2): Reads from send channel → writes to WebSocket. Also sends periodic pings.
```
client.send → WriteMessage() → WebSocket
```

Why separate goroutines? The WebSocket library doesn't support concurrent writes. The write pump ensures only one goroutine ever writes. Messages from any source go through the `send` channel.

#### Connection Lifecycle

```
1. HTTP request hits /ws endpoint
2. handlers.go upgrades to WebSocket
3. NewClient() creates client with send channel
4. hub.register <- client
5. go client.WritePump()  ← goroutine
6. go client.ReadPump()   ← goroutine
7. ... reads/writes happen ...
8. Connection closes → ReadPump exits
9. defer: hub.unregister <- client, conn.Close()
10. WritePump detects closed send channel, exits
```

#### Keepalive

- **Ping**: WritePump sends WebSocket ping every 54 seconds (`pingPeriod`)
- **Pong**: ReadPump sets a pong handler that resets the 60-second read deadline
- If no pong received within 60 seconds → connection considered dead → ReadPump exits

---

### 8.2 `hub.go` — Game Hub

**Purpose**: The central coordinator for one game room. Routes messages between clients and the game engine.

```go
type Hub struct {
    mu         sync.Mutex
    gameID     string
    lobby      *lobby.Lobby
    game       *engine.Game        // nil until game starts
    clients    map[*Client]bool    // set of connected clients
    register   chan *Client         // incoming connections
    unregister chan *Client         // disconnections
    incoming   chan IncomingMessage  // messages from clients
    quit       chan struct{}        // shutdown signal
}
```

#### Event Loop — `Run()`

The hub runs a `select` loop that handles three types of events:

```go
for {
    select {
    case client := <-h.register:
        // Add client to set, send current state

    case client := <-h.unregister:
        // Remove client, close send channel

    case msg := <-h.incoming:
        // Route message to appropriate handler

    case <-h.quit:
        return
    }
}
```

This is the **actor model** — the hub is a single-threaded event processor. No data races because all state mutation happens in one goroutine.

#### Message Routing — `handleMessage()`

```
"join"       → handleJoin()       → lobby.Join() → sendLobbyUpdate()
"ready"      → handleReady()      → lobby.SetReady() → sendLobbyUpdate()
"start_game" → handleStartGame()  → engine.NewGame() + StartGame() → broadcastState()
other        → handleGameAction() → game.Apply() → broadcastEvents() + broadcastState()
```

#### `handleStartGame()`

1. Checks `lobby.CanStart()`
2. Creates `engine.Player` objects from lobby players
3. Registers all 8 abilities in a new `AbilityRegistry`
4. Creates `engine.Game` with default config
5. Calls `game.StartGame()` → gets initial events
6. Broadcasts events and state to all clients

#### `handleGameAction()`

1. Parses the envelope payload into an `engine.Action`
2. Calls `game.Apply(playerID, action)` — the engine does all validation and state mutation
3. If error → sends error message back to the client only
4. If success → broadcasts events to everyone, then sends updated state to everyone

#### State Broadcasting

**`broadcastEvents(events)`**: Wraps each event in an envelope and sends to ALL clients.

**`broadcastState()`**: Sends appropriate view to each client:
- TV clients → `game.PublicView()` as `game_state` message
- Player clients → `game.ViewFor(playerID)` as `player_state` message

This is where the TV/phone split happens. The engine's `PublicView()` never includes private data (hand contents, character picks). The engine's `ViewFor()` includes everything a specific player should see.

---

### 8.3 `handlers.go` — HTTP Handlers

**Purpose**: HTTP endpoint handlers.

```go
type Handlers struct {
    LobbyMgr *lobby.Manager
    Hubs      map[string]*Hub
    Port      int
}
```

#### `HandleCreateGame` — `GET /api/create`

1. Creates a new lobby via `LobbyMgr.Create()` → gets a game ID
2. Creates a new Hub for that game
3. Starts the hub's event loop in a goroutine: `go hub.Run()`
4. Redirects the browser to `/tv.html?game={gameID}` (HTTP 303)

#### `HandleQR` — `GET /api/qr?game={gameID}`

1. Detects the server's local IP address (`getLocalIP()`)
2. Constructs URL: `http://{localIP}:{port}/lobby.html?game={gameID}`
3. Generates a QR code PNG using `qrcode.Generate(url)`
4. Returns the PNG with `Content-Type: image/png`

The QR code uses the local network IP (not `localhost`) so phones on the same Wi-Fi can reach the server.

#### `HandleWS` — `GET /ws?game={gameID}&player={playerID}&type={tv|player}`

1. Reads query parameters: game ID, player ID, client type
2. Looks up the game's Hub
3. Upgrades HTTP connection to WebSocket using `gorilla/websocket`
4. Creates a `Client` and registers it with the Hub
5. Starts ReadPump and WritePump goroutines

**WebSocket Upgrader** has `CheckOrigin: func(r *http.Request) bool { return true }` — allows connections from any origin. This is needed because phones connect from different IPs/origins.

#### `HandlePlayerID` — `GET /api/player-id`

Returns a randomly generated 16-character hex player ID. Used as a fallback; normally the frontend generates its own ID.

#### `getLocalIP()`

Scans network interfaces to find the first non-loopback IPv4 address. This is the IP used in the QR code URL so phones on the same LAN can connect.

---

### 8.4 `server.go` — HTTP Server

**Purpose**: Ties everything together — static file serving + API routes.

```go
func (s *Server) Start() error {
    mux := http.NewServeMux()

    // Static files from embedded FS
    sub, _ := fs.Sub(s.static, "web/static")
    mux.Handle("/", http.FileServer(http.FS(sub)))

    // API routes
    mux.HandleFunc("/api/create", s.handlers.HandleCreateGame)
    mux.HandleFunc("/api/qr", s.handlers.HandleQR)
    mux.HandleFunc("/api/player-id", s.handlers.HandlePlayerID)
    mux.HandleFunc("/ws", s.handlers.HandleWS)

    return http.ListenAndServe(":8080", mux)
}
```

**`http.NewServeMux()`** — Go's built-in HTTP router. Routes are matched by prefix. More specific routes (`/api/create`) take priority over less specific (`/`).

**`fs.Sub(s.static, "web/static")`** — the embedded FS has paths like `web/static/tv.html`. `fs.Sub` removes the prefix, so `tv.html` is served at `/tv.html`.

**`http.FileServer(http.FS(sub))`** — serves static files from the filesystem. `http.FS()` adapts `fs.FS` to `http.FileSystem`.

**`http.ListenAndServe`** — starts the server. This call blocks forever (until error or shutdown).

---

### 8.5 `session.go` — Player Sessions

**Purpose**: Generates random player IDs.

```go
func GeneratePlayerID() string {
    b := make([]byte, 8)
    rand.Read(b)  // crypto/rand for uniqueness
    return hex.EncodeToString(b)  // 16 hex characters
}
```

Player IDs are stored in `localStorage` on the phone, so refreshing the page reconnects as the same player.

---

## 9. QR Code — `internal/qrcode/`

**Purpose**: Generates QR code PNG images.

```go
func Generate(url string) ([]byte, error) {
    return qr.Encode(url, qr.Medium, 256)
}
```

Uses `github.com/skip2/go-qrcode`. Parameters:
- `url` — the string to encode (lobby URL with local IP)
- `qr.Medium` — error correction level (can lose ~15% of data and still scan)
- `256` — image size in pixels

Returns raw PNG bytes, served directly as HTTP response.

---

## 10. Entry Point — `main.go`

```go
//go:embed web/static
var static embed.FS

func main() {
    port := flag.Int("port", 8080, "server port")
    flag.Parse()
    srv := server.New(*port, static)
    srv.Start()
}
```

**`//go:embed web/static`** — compiler directive. At build time, Go reads the entire `web/static/` directory and embeds it into the binary. At runtime, `static` is a virtual filesystem containing all the HTML/CSS/JS files. No external files needed — the binary is self-contained.

**`flag.Int("port", 8080, "server port")`** — defines a command-line flag. `flag.Parse()` reads `os.Args`. Usage: `citadels.exe -port 3000`.

**`*port`** — dereference pointer. `flag.Int` returns `*int` (pointer to int).

---

## 11. Frontend — `web/static/`

All frontend code is vanilla JavaScript — no React, Vue, Angular, or any build tools. Files are served as-is from the embedded filesystem.

### 11.1 `ws.js` — WebSocket Manager

**Purpose**: Shared WebSocket wrapper used by both TV and player screens.

```javascript
class WS {
    constructor(url, onMessage, onOpen, onClose) { ... }
    connect() { ... }
    send(type, payload) { ... }
}
```

**Features:**
- **Auto-reconnect**: on connection close, waits `reconnectDelay` ms then reconnects
- **Exponential backoff**: delay doubles on each failure (1s → 2s → 4s → ... → max 10s)
- **Reset on success**: when connection opens, delay resets to 1s
- **JSON handling**: `send()` wraps type+payload in `{type, payload}` envelope. `onMessage` receives parsed JSON.

### 11.2 `tv.html` + `tv.js` — TV Screen

**Purpose**: The public display shown on a TV/monitor.

**Lifecycle:**
1. Reads `game` parameter from URL
2. Connects to `ws://{host}/ws?game={id}&type=tv`
3. Listens for `lobby_update` → renders lobby view (QR code + player list)
4. Listens for `game_state` → renders game view
5. When phase is `GameOver` → renders score table

**Views:**

**Lobby View:**
- Large QR code image (`/api/qr?game={id}`)
- List of connected players with ready status
- Player count

**Game View:**
- Header with game phase and round number
- Draft info: face-up characters, available count, current picker
- Character call banner (during Resolution/PlayerTurn)
- Player grid: each player card shows name, gold, hand size, city districts, revealed roles
- Active player highlighted with gold border and shadow

**Game Over View:**
- Score table sorted by total (highest first)
- Columns: Player, Districts, Colors, Complete, Special, Total

### 11.3 `player.html` + `player.js` — Phone Controller

**Purpose**: Each player's private controller on their phone.

**Lifecycle:**
1. Generates or retrieves `playerID` from `localStorage`
2. Shows join form (name input + "Join Game" button)
3. On join: sends `{type: "join", payload: {player_id, name}}` via WebSocket
4. Shows lobby: player list + Ready/Start buttons
5. On game start: renders game state based on phase

**Views:**

**Join Form:**
- Name input (pre-filled from localStorage)
- "Join Game" button

**Lobby:**
- Player list with ready status
- "Ready!" toggle button
- "Start Game" button (visible when ≥2 players)

**Draft Phase:**
- List of available characters as tappable buttons
- Tapping sends `{type: "draft_pick", payload: {character: N}}`
- If not your turn: "Waiting for other players to pick..."

**Draw Choice Phase:**
- Shows drawn cards with names and costs
- Tapping a card sends `{type: "keep_card", payload: {index: N}}`

**Player Turn:**
- "Your turn! (CharacterName)" indicator
- Action buttons: "Take 2 Gold", "Draw Cards", "Use Ability", "End Turn"
- Ability section: expandable target list
- Hand cards: tappable to build (when allowed)
- City display: colored chips for built districts

**Game Over:**
- Score list sorted by total
- Winner highlighted

**Helper Functions:**
- `roleNameToNum(name)` — converts "Assassin"→1, "King"→4, etc.
- `colorLabel(color)` — converts color number to name
- `bindActions()` — attaches click handlers after each render

### 11.4 `lobby.html` — QR Landing Page

Identical to `player.html` — includes the same JS. The QR code encodes a URL to this page with `?game={id}`. When scanned, the phone opens this page and the player.js script handles everything.

### 11.5 CSS — Styles

#### `common.css` — Shared Base Theme
- Dark background (`#1a1a2e`), light text (`#eee`)
- Gold accent color (`#e0a030`) for headers and buttons
- Card component (`.card`): dark panel with border radius
- District color classes: `.color-noble` (gold), `.color-religious` (blue), `.color-trade` (green), `.color-military` (red), `.color-special` (purple)
- Utility class: `.hidden` (display: none)

#### `tv.css` — TV Layout
- Large fonts (20px+ base)
- Responsive player grid (`grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))`)
- QR code section with gold border
- Player cards with active state animation
- Draft info panel
- Character call banner with pulsing glow animation
- Score table with styled headers
- Lobby player chips

#### `player.css` — Phone Layout
- Max-width 480px container (phone-sized)
- Vertically stacked sections
- Large touch targets (14px+ padding on buttons)
- Hand cards as tappable rows
- Draft choices as tappable blocks
- Turn indicator with gold border
- Ability section with purple accent

---

## 12. Data Flow

### 12.1 Creating a Game

```
Browser → GET /api/create
    Server: LobbyMgr.Create() → gameID
    Server: NewHub(gameID, lobby) → go hub.Run()
    Server: HTTP 303 → /tv.html?game={gameID}
Browser → GET /tv.html?game={gameID}
    Server: serves embedded tv.html
Browser → WS /ws?game={gameID}&type=tv
    Server: upgrades to WebSocket
    Hub: registers TV client
    Hub: sends lobby_update to TV
TV: shows QR code + empty player list
```

### 12.2 Player Joining

```
Phone scans QR → opens http://{IP}:8080/lobby.html?game={gameID}
    Server: serves embedded lobby.html (= player.html)
Phone JS: generates playerID, stores in localStorage
Phone → WS /ws?game={gameID}&player={playerID}&type=player
    Hub: registers player client
    Hub: sends lobby_update to all
Phone: shows join form
Player enters name, taps "Join Game"
Phone → WS: {type: "join", payload: {player_id: "xxx", name: "Alice"}}
    Hub: lobby.Join("xxx", "Alice")
    Hub: sends lobby_update to all (TV + all phones)
TV: shows "Alice" in player list
```

### 12.3 Starting the Game

```
Player taps "Ready!"
Phone → WS: {type: "ready", payload: {ready: true}}
    Hub: lobby.SetReady("xxx", true)
    Hub: sends lobby_update to all

All players ready. One player taps "Start Game"
Phone → WS: {type: "start_game", payload: {}}
    Hub: lobby.CanStart() → true
    Hub: lobby.Start()
    Hub: engine.NewGame(players, config, abilities)
    Hub: game.StartGame() → events
    Hub: broadcastEvents(events) → all clients get events
    Hub: broadcastState():
        TV → game.PublicView() as "game_state"
        Each phone → game.ViewFor(playerID) as "player_state"
TV: switches from lobby view to game view (draft phase)
Phones: switch to draft view (available characters)
```

### 12.4 During Gameplay

```
Player sees draft choices, taps "King"
Phone → WS: {type: "draft_pick", payload: {character: 4}}
    Hub: game.Apply(playerID, {Type: "draft_pick", Character: 4})
    Engine: validates phase, validates it's this player's turn
    Engine: removes King from available, adds to player's picks
    Engine: returns [EventDraftPick]
    Hub: broadcastEvents + broadcastState

... all players pick ...

Engine: draft complete → assigns characters → starts resolution
Engine: CallCharacter(1) → CallCharacter(2) → ...
    Each call: check murder/robbery, apply passive, set up player turn
Hub: broadcasts state after each character call

Player's turn:
Phone → WS: {type: "take_gold", payload: {}}
    Engine: player.Gold += 2, player.TookAction = true
    Returns: [EventGoldTaken]
Phone → WS: {type: "build", payload: {district_name: "Manor"}}
    Engine: removes from hand, deducts gold, adds to city
    Returns: [EventDistrictBuilt]
Phone → WS: {type: "end_turn", payload: {}}
    Engine: advances to next character
    Returns: [EventTurnEnd, EventCharacterCall, ...]
```

### 12.5 Game End

```
Player builds 7th district → engine sets FinalRound = true
Round completes (all 8 characters called)
Engine: endRound() → endGame()
    Phase → PhaseGameOver
    CalculateScores() → ScoreEntry for each player
    Returns: [EventRoundEnd, EventGameOver]
Hub: broadcasts final state
TV: renders score table
Phones: render score list
```

---

## 13. WebSocket Protocol Reference

### 13.1 Envelope Format

All messages (both directions) follow this format:

```json
{
    "type": "message_type",
    "payload": { ... }
}
```

### 13.2 Client → Server Messages

#### `join`
```json
{"type": "join", "payload": {"player_id": "abc123", "name": "Alice"}}
```

#### `ready`
```json
{"type": "ready", "payload": {"ready": true}}
```

#### `start_game`
```json
{"type": "start_game", "payload": {}}
```

#### `draft_pick`
```json
{"type": "draft_pick", "payload": {"character": 4}}
```
Character is the role number (1-8).

#### `take_gold`
```json
{"type": "take_gold", "payload": {}}
```

#### `draw_cards`
```json
{"type": "draw_cards", "payload": {}}
```

#### `keep_card`
```json
{"type": "keep_card", "payload": {"index": 0}}
```
Index into the drawn cards array.

#### `build`
```json
{"type": "build", "payload": {"district_name": "Manor"}}
```

#### `ability`
```json
// Assassin/Thief: target a character role
{"type": "ability", "payload": {"character": 5}}

// Magician swap:
{"type": "ability", "payload": {"extra_data": "swap_hand", "target": "player_id"}}

// Magician discard/draw:
{"type": "ability", "payload": {"extra_data": "discard_draw", "indices": [0, 2]}}

// Warlord:
{"type": "ability", "payload": {"target": "player_id", "district_name": "Tavern"}}
```

#### `end_turn`
```json
{"type": "end_turn", "payload": {}}
```

#### `lab_discard`
```json
{"type": "lab_discard", "payload": {"district_name": "Tavern"}}
```

#### `smithy_draw`
```json
{"type": "smithy_draw", "payload": {}}
```

### 13.3 Server → Client Messages

#### `lobby_update`
```json
{
    "type": "lobby_update",
    "payload": {
        "game_id": "50de0479",
        "players": [
            {"id": "abc", "name": "Alice", "ready": true},
            {"id": "def", "name": "Bob", "ready": false}
        ],
        "started": false
    }
}
```

#### `game_state` (TV only)
```json
{
    "type": "game_state",
    "payload": {
        "phase": "PlayerTurn",
        "round": 2,
        "current_call": "King",
        "current_turn": "Alice",
        "current_role": "King",
        "deck_size": 45,
        "draft_face_up": ["Thief", "Bishop"],
        "draft_available": 3,
        "draft_picker": "Alice",
        "players": [
            {
                "id": "abc",
                "name": "Alice",
                "gold": 5,
                "hand_size": 3,
                "city": [{"name": "Manor", "color": 1, "cost": 3}],
                "has_crown": true,
                "revealed_roles": ["King"]
            }
        ]
    }
}
```

#### `player_state` (phones)
Same as `game_state` PLUS:
```json
{
    "type": "player_state",
    "payload": {
        // ... all public view fields ...
        "hand": [{"name": "Tavern", "color": 3, "cost": 1}],
        "characters": ["King"],
        "is_my_turn": true,
        "can_build": true,
        "can_use_ability": false,
        "can_take_action": false,
        "draft_choices": ["Assassin", "Thief", "Magician"],
        "drawn_cards": [{"name": "Manor", "color": 1, "cost": 3}],
        "keep_count": 1,
        "valid_targets": ["Bob:Tavern"]
    }
}
```

#### `event`
```json
{
    "type": "event",
    "payload": {
        "type": "district_built",
        "player": "abc",
        "data": {"district": "Manor", "cost": 3, "color": "Noble"}
    }
}
```

#### `error`
```json
{
    "type": "error",
    "payload": {"message": "not your turn"}
}
```

---

## 14. Build, Run, Test

### Prerequisites
- Go 1.25+ installed

### Build
```bash
cd C:\Users\Albert\GolandProjects\citadels
go build -o citadels.exe .
```

Produces a single ~9.6 MB binary with all frontend files embedded.

### Run
```bash
# Default port (8080)
./citadels.exe

# Custom port
./citadels.exe -port 3000
```

### Run from source (without building)
```bash
go run .
```

### Test
```bash
# All tests
go test ./...

# Verbose
go test ./... -v

# Engine tests only
go test ./internal/engine/... -v

# Force re-run (no cache)
go test ./... -v -count=1
```

### Vet (static analysis)
```bash
go vet ./...
```

### Accessing the Game
1. Open `http://localhost:8080/api/create` in a browser → creates game, shows TV screen
2. Scan QR code with phone → opens lobby page
3. Enter name, join, ready, start

---

## 15. Extensibility

### Adding a New Character

1. Create `internal/engine/abilities/newcharacter.go`:
```go
package abilities

type NewCharacter struct{}

func (n NewCharacter) Role() engine.CharacterRole { return 9 }
func (n NewCharacter) NeedsTarget() bool          { return true }
func (n NewCharacter) IsPassive() bool             { return false }
func (n NewCharacter) ValidTargets(g *engine.Game, playerID string) []string { ... }
func (n NewCharacter) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) { ... }
```

2. Add the role constant in `character.go`
3. Register in `hub.go`'s `handleStartGame()`: `reg.Register(abilities.NewCharacter{})`
4. Update `AllRoles()` and draft configs if needed

### Adding a New Special District

1. Add to `BaseDistricts()` in `district.go`
2. If it has in-game effects, add handling in `game.go` (like Observatory/Library are handled in `applyDrawCards`)

### Changing Game Rules

- **End-game threshold**: modify `GameConfig.EndCitySize`
- **Starting gold/cards**: modify `StartGame()`
- **Build limit**: modify the `maxBuild` logic in `applyBuild()`

---

## 16. Go Concepts Used

This section explains Go-specific concepts used throughout the codebase, for developers coming from other languages.

### Packages and Visibility

Every `.go` file starts with `package name`. Files in the same directory must have the same package. Packages are imported by path: `import "citadels/internal/engine"`.

**Visibility rule**: Names starting with uppercase (`Game`, `Apply`, `Player`) are **exported** (public). Lowercase (`cards`, `startDraft`, `mu`) are **unexported** (package-private). There is no `public`/`private`/`protected` keywords.

**`internal/`**: Special directory in Go. Packages under `internal/` can only be imported by code within the parent directory. Prevents external code from depending on implementation details.

### Structs (instead of classes)

Go has no classes, inheritance, or constructors. Instead:

```go
type Player struct {
    Name string
    Gold int
}

// "Constructor" — just a function that returns a pointer
func NewPlayer(name string) *Player {
    return &Player{Name: name, Gold: 2}
}

// Method — function with a receiver
func (p *Player) AddGold(n int) {
    p.Gold += n
}
```

### Interfaces (duck typing)

No `implements` keyword. If a type has all the methods listed in an interface, it satisfies that interface automatically:

```go
type Ability interface {
    Role() CharacterRole
    Apply(g *Game, ...) ([]Event, error)
}

type Assassin struct{}
func (a Assassin) Role() CharacterRole { return 1 }
func (a Assassin) Apply(...) ([]Event, error) { ... }
// Assassin automatically implements Ability
```

### Error Handling

No exceptions. Errors are values returned from functions:

```go
events, err := game.Apply(playerID, action)
if err != nil {
    // handle error
    return
}
// use events
```

### Goroutines and Channels

**Goroutine**: lightweight thread. Started with `go function()`. Thousands can run concurrently.

**Channel**: typed pipe for goroutine communication:
```go
ch := make(chan int)      // unbuffered
ch := make(chan int, 100) // buffered

go func() { ch <- 42 }() // send
value := <-ch             // receive (blocks until value available)
```

**Select**: multiplexes multiple channels:
```go
select {
case msg := <-incoming:
    handleMessage(msg)
case client := <-register:
    addClient(client)
}
```

### Defer

Schedules a function call to run when the enclosing function returns:

```go
func doSomething() {
    f, _ := os.Open("file.txt")
    defer f.Close() // will run when doSomething() returns, no matter how
    // ... use f ...
}
```

### Slices

Dynamic arrays. Created with `make`, grown with `append`:

```go
var s []int          // nil slice
s = make([]int, 5)   // length 5, all zeros
s = append(s, 42)    // grows automatically
s[0:3]               // sub-slice (elements 0, 1, 2)
```

### Maps

Hash tables:

```go
m := make(map[string]int)
m["key"] = 42
value, ok := m["key"]  // ok is true if key exists
delete(m, "key")
```

### Embedding (//go:embed)

Compile-time file embedding:

```go
//go:embed web/static
var static embed.FS  // virtual filesystem baked into binary
```

No external files needed at runtime. The binary is fully self-contained.

### JSON Struct Tags

Control serialization:

```go
type Player struct {
    Name     string `json:"name"`          // → "name" in JSON
    Gold     int    `json:"gold"`          // → "gold" in JSON
    Internal bool   `json:"-"`             // excluded from JSON
    Score    int    `json:"score,omitempty"` // excluded if zero
}
```

### Mutex

Protects shared data from concurrent access:

```go
var mu sync.Mutex
mu.Lock()
// ... safe to read/write shared data ...
mu.Unlock()
```

### Pointers

`*T` is a pointer to T. `&value` takes address. `*ptr` dereferences:

```go
p := &Player{Name: "Alice"}  // p is *Player
p.Name = "Bob"                // modifies original (no -> like in C)
```

Methods with `*T` receiver can modify the struct. Methods with `T` receiver work on a copy.
