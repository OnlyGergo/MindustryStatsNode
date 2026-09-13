package poller

import "testing"

func TestDecodeGamemode(t *testing.T) {
	tests := []struct {
		name string
		mode string
		ord  int
		want string
	}{
		{"the server's own name wins", "Hexed", int(GameModeSurvival), "Hexed"},
		{"vanilla name for an empty name", "", int(GameModeAttack), "Attack"},
		{"survival", "", int(GameModeSurvival), "Survival"},
		{"editor is the last ordinal", "", int(GameModeEditor), "Editor"},
		{"unknown ordinal has no vanilla name", "", 9, ""},
		{"negative ordinal has no vanilla name", "", -1, ""},
		{"a named mode is kept even for an unknown ordinal", "Crawler Rush", 9, "Crawler Rush"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := DecodeGamemode(tc.mode, tc.ord); got != tc.want {
				t.Errorf("DecodeGamemode(%q, %d) = %q, want %q", tc.mode, tc.ord, got, tc.want)
			}
		})
	}
}
