package engine

// GameConfig holds configuration for creating a new game.
type GameConfig struct {
	Districts     []District    // card pool
	EndCitySize   int           // number of districts to trigger end game (default 7)
}

func DefaultConfig() GameConfig {
	return GameConfig{
		Districts:   BaseDistricts(),
		EndCitySize: 7,
	}
}
