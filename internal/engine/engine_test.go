package engine_test

import (
	"citadels/internal/engine"
	"citadels/internal/engine/abilities"
	"testing"
)

func newRegistry() *engine.AbilityRegistry {
	r := engine.NewAbilityRegistry()
	r.Register(abilities.Assassin{})
	r.Register(abilities.Thief{})
	r.Register(abilities.Magician{})
	r.Register(abilities.King{})
	r.Register(abilities.Bishop{})
	r.Register(abilities.Merchant{})
	r.Register(abilities.Architect{})
	r.Register(abilities.Warlord{})
	return r
}

func newTestGame(n int) *engine.Game {
	var players []*engine.Player
	for i := 0; i < n; i++ {
		p := engine.NewPlayer(
			string(rune('A'+i)),
			"Player"+string(rune('1'+i)),
		)
		players = append(players, p)
	}
	cfg := engine.DefaultConfig()
	return engine.NewGame(players, cfg, newRegistry())
}

func TestNewGame(t *testing.T) {
	g := newTestGame(4)
	if len(g.Players) != 4 {
		t.Fatalf("expected 4 players, got %d", len(g.Players))
	}
	if g.Phase != engine.PhaseLobby {
		t.Fatalf("expected Lobby phase, got %s", g.Phase)
	}
}

func TestStartGame(t *testing.T) {
	g := newTestGame(4)
	events := g.StartGame()
	if g.Phase != engine.PhaseDraftPick {
		t.Fatalf("expected DraftPick phase, got %s", g.Phase)
	}
	if len(events) == 0 {
		t.Fatal("expected events from StartGame")
	}
	for _, p := range g.Players {
		if len(p.Hand) != 4 {
			t.Errorf("player %s should have 4 cards, got %d", p.Name, len(p.Hand))
		}
		if p.Gold != 2 {
			t.Errorf("player %s should have 2 gold, got %d", p.Name, p.Gold)
		}
	}
	if !g.Players[0].HasCrown {
		t.Error("first player should have crown")
	}
}

func TestDraftConfig(t *testing.T) {
	tests := []struct {
		n        int
		faceDown int
		faceUp   int
		picks    int
	}{
		{2, 1, 0, 2},
		{3, 1, 0, 2},
		{4, 1, 2, 1},
		{5, 1, 1, 1},
		{6, 1, 0, 1},
		{7, 1, 0, 1},
	}
	for _, tt := range tests {
		fd, fu, pp := engine.DraftConfig(tt.n)
		if fd != tt.faceDown || fu != tt.faceUp || pp != tt.picks {
			t.Errorf("DraftConfig(%d) = (%d,%d,%d), want (%d,%d,%d)",
				tt.n, fd, fu, pp, tt.faceDown, tt.faceUp, tt.picks)
		}
	}
}

func TestDraftAndResolve(t *testing.T) {
	g := newTestGame(4)
	g.StartGame()

	// 4 players: each picks 1 character
	draft := g.Draft
	if draft == nil {
		t.Fatal("draft should not be nil after StartGame")
	}

	// Each player picks from available
	for i := 0; i < 4; i++ {
		picker := draft.CurrentPickerID()
		if picker == "" {
			t.Fatalf("no picker at step %d", i)
		}
		avail := draft.Available
		if len(avail) == 0 {
			t.Fatalf("no available characters at step %d", i)
		}
		_, err := g.Apply(picker, engine.Action{
			Type:      engine.ActionDraftPick,
			Character: avail[0],
		})
		if err != nil {
			t.Fatalf("draft pick %d error: %v", i, err)
		}
	}

	// After draft, should be in Resolution or PlayerTurn
	if g.Phase != engine.PhasePlayerTurn && g.Phase != engine.PhaseResolution {
		t.Fatalf("expected PlayerTurn or Resolution after draft, got %s", g.Phase)
	}
}

func TestTakeGoldAndBuild(t *testing.T) {
	g := newTestGame(4)
	g.StartGame()

	// Manually set up a player turn
	p := g.Players[0]
	p.Gold = 10
	p.Hand = []engine.District{
		{Name: "Tavern", Color: engine.ColorTrade, Cost: 1},
		{Name: "Manor", Color: engine.ColorNoble, Cost: 3},
	}
	p.Characters = []engine.CharacterRole{engine.RoleMerchant}
	g.Phase = engine.PhasePlayerTurn
	g.CurrentTurnPlayer = p.ID
	g.CurrentTurnRole = engine.RoleMerchant

	// Take gold
	events, err := g.Apply(p.ID, engine.Action{Type: engine.ActionTakeGold})
	if err != nil {
		t.Fatalf("take gold error: %v", err)
	}
	if p.Gold != 12 {
		t.Errorf("expected 12 gold, got %d", p.Gold)
	}
	if len(events) == 0 {
		t.Error("expected events from take gold")
	}

	// Build
	events, err = g.Apply(p.ID, engine.Action{Type: engine.ActionBuild, DistrictName: "Tavern"})
	if err != nil {
		t.Fatalf("build error: %v", err)
	}
	if len(p.City) != 1 || p.City[0].Name != "Tavern" {
		t.Error("Tavern should be in city")
	}
	if p.Gold != 11 {
		t.Errorf("expected 11 gold after building Tavern, got %d", p.Gold)
	}
	if len(events) == 0 {
		t.Error("expected events from build")
	}
}

func TestScoring(t *testing.T) {
	g := newTestGame(2)
	g.StartGame()

	p := g.Players[0]
	p.City = []engine.District{
		{Name: "Manor", Color: engine.ColorNoble, Cost: 3},
		{Name: "Temple", Color: engine.ColorReligious, Cost: 1},
		{Name: "Tavern", Color: engine.ColorTrade, Cost: 1},
		{Name: "Watchtower", Color: engine.ColorMilitary, Cost: 1},
		{Name: "University", Color: engine.ColorSpecial, Cost: 6},
		{Name: "Castle", Color: engine.ColorNoble, Cost: 4},
		{Name: "Church", Color: engine.ColorReligious, Cost: 2},
	}
	g.FirstToComplete = p.ID
	g.Config.EndCitySize = 7

	scores := g.CalculateScores()
	s := scores[0]

	expectedDistrict := 3 + 1 + 1 + 1 + 6 + 4 + 2
	if s.DistrictScore != expectedDistrict {
		t.Errorf("district score: got %d, want %d", s.DistrictScore, expectedDistrict)
	}
	if s.ColorBonus != 3 {
		t.Errorf("color bonus: got %d, want 3", s.ColorBonus)
	}
	if s.FirstComplete != 4 {
		t.Errorf("first complete: got %d, want 4", s.FirstComplete)
	}
	if s.SpecialBonus != 2 {
		t.Errorf("special bonus (University): got %d, want 2", s.SpecialBonus)
	}
	expected := expectedDistrict + 3 + 4 + 2
	if s.Total != expected {
		t.Errorf("total: got %d, want %d", s.Total, expected)
	}
}

func TestDeck(t *testing.T) {
	cards := []engine.District{
		{Name: "A", Cost: 1},
		{Name: "B", Cost: 2},
		{Name: "C", Cost: 3},
	}
	d := engine.NewDeck(cards)
	if d.Len() != 3 {
		t.Fatalf("deck len: got %d, want 3", d.Len())
	}

	drawn := d.Draw(2)
	if len(drawn) != 2 {
		t.Fatalf("drawn: got %d, want 2", len(drawn))
	}
	if d.Len() != 1 {
		t.Fatalf("deck len after draw: got %d, want 1", d.Len())
	}

	d.Return(drawn)
	if d.Len() != 3 {
		t.Fatalf("deck len after return: got %d, want 3", d.Len())
	}
}

func TestBaseDistricts(t *testing.T) {
	cards := engine.BaseDistricts()
	if len(cards) != 62 {
		t.Errorf("base districts: got %d cards, want 62", len(cards))
	}
}

func TestCharacterRoleString(t *testing.T) {
	if engine.RoleAssassin.String() != "Assassin" {
		t.Errorf("RoleAssassin.String() = %s", engine.RoleAssassin.String())
	}
	if engine.RoleKing.String() != "King" {
		t.Errorf("RoleKing.String() = %s", engine.RoleKing.String())
	}
}
