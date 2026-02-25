package engine

// CharacterRole identifies the 8 base-game characters.
type CharacterRole int

const (
	RoleAssassin  CharacterRole = 1
	RoleThief     CharacterRole = 2
	RoleMagician  CharacterRole = 3
	RoleKing      CharacterRole = 4
	RoleBishop    CharacterRole = 5
	RoleMerchant  CharacterRole = 6
	RoleArchitect CharacterRole = 7
	RoleWarlord   CharacterRole = 8
)

var roleNames = map[CharacterRole]string{
	RoleAssassin:  "Assassin",
	RoleThief:     "Thief",
	RoleMagician:  "Magician",
	RoleKing:      "King",
	RoleBishop:    "Bishop",
	RoleMerchant:  "Merchant",
	RoleArchitect: "Architect",
	RoleWarlord:   "Warlord",
}

func (r CharacterRole) String() string {
	if s, ok := roleNames[r]; ok {
		return s
	}
	return "Unknown"
}

// DistrictColor associated with each character for gold collection.
func (r CharacterRole) Color() DistrictColor {
	switch r {
	case RoleKing:
		return ColorNoble
	case RoleBishop:
		return ColorReligious
	case RoleMerchant:
		return ColorTrade
	case RoleWarlord:
		return ColorMilitary
	default:
		return ColorNone
	}
}

// AllRoles returns the 8 base-game roles in order.
func AllRoles() []CharacterRole {
	return []CharacterRole{
		RoleAssassin, RoleThief, RoleMagician, RoleKing,
		RoleBishop, RoleMerchant, RoleArchitect, RoleWarlord,
	}
}
