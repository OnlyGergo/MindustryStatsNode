package mindustry

import "testing"

func TestStripColors(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"[accent]Attack", "Attack"},
		{"[#ff0000]Red[] mode", "Red mode"},
		{"no markup", "no markup"},
		{"[]", ""},
		{"[not a colour!]kept", "[not a colour!]kept"},
	}

	for _, tc := range tests {
		if got := StripColors(tc.in); got != tc.want {
			t.Errorf("StripColors(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestCleanModeName(t *testing.T) {
	tests := []struct {
		name string
		mode string
		ord  int
		want string
	}{
		{"colour markup stripped", "[accent]Hexed", 0, "Hexed"},
		{"empty name falls back to the vanilla name", "", 3, "PvP"},
		{"markup-only name falls back too", "[accent]", 1, "Sandbox"},
		{"unknown ordinal without a name", "", 42, "Unknown"},
		{"named mode beats the ordinal", "Crawler Rush", 0, "Crawler Rush"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := CleanModeName(tc.mode, tc.ord); got != tc.want {
				t.Errorf("CleanModeName(%q, %d) = %q, want %q", tc.mode, tc.ord, got, tc.want)
			}
		})
	}
}

func TestVanillaModeName(t *testing.T) {
	if got := VanillaModeName(4); got != "Editor" {
		t.Errorf("VanillaModeName(4) = %q, want %q", got, "Editor")
	}
	if got := VanillaModeName(-1); got != "Unknown" {
		t.Errorf("VanillaModeName(-1) = %q, want %q", got, "Unknown")
	}
}

func TestSanitizeText(t *testing.T) {
	if got := SanitizeText("plain"); got != "plain" {
		t.Errorf("SanitizeText() rewrote a valid string: %q", got)
	}
	if got := SanitizeText("a\x00b"); got != "ab" {
		t.Errorf("SanitizeText(NUL) = %q, want %q", got, "ab")
	}
	if got := SanitizeText(string([]byte{0xFF, 'x'})); got != "�x" {
		t.Errorf("SanitizeText(invalid utf8) = %q, want the replacement character", got)
	}
}
