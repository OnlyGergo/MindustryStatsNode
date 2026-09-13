package poller

import (
	"errors"
	"strings"
	"testing"
	"unicode/utf8"
)

func packString(s string) []byte {
	return append([]byte{byte(len(s))}, []byte(s)...)
}

func TestReadString(t *testing.T) {
	tests := []struct {
		name       string
		buf        []byte
		want       string
		wantOffset int
	}{
		{"empty string consumes only its length byte", []byte{0x00}, "", 1},
		{"ascii", packString("Serpulo"), "Serpulo", 8},
		{"multi-byte utf8 counts bytes, not runes", packString("Ω蟹"), "Ω蟹", 6},
		{"trailing bytes are left for the next read", append(packString("ab"), 0xFF), "ab", 3},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			offset := 0
			got, err := ReadString(tc.buf, &offset)
			if err != nil {
				t.Fatalf("ReadString() error = %v", err)
			}
			if got != tc.want {
				t.Errorf("ReadString() = %q, want %q", got, tc.want)
			}
			if offset != tc.wantOffset {
				t.Errorf("offset = %d, want %d", offset, tc.wantOffset)
			}
		})
	}
}

func TestReadStringSanitizesInvalidUTF8(t *testing.T) {
	// Node's Buffer.toString('utf8') substitutes U+FFFD here; Postgres rejects
	// the raw bytes, so the Go port has to do the same.
	buf := []byte{0x03, 0xFF, 0xFE, 'a'}

	offset := 0
	got, err := ReadString(buf, &offset)
	if err != nil {
		t.Fatalf("ReadString() error = %v", err)
	}
	if strings.ContainsRune(got, 0xFF) || !strings.HasSuffix(got, "a") {
		t.Errorf("ReadString() = %q, want the invalid bytes replaced and 'a' kept", got)
	}
	if !utf8.ValidString(got) {
		t.Errorf("ReadString() = %q, which is not valid UTF-8", got)
	}
}

func TestReadStringDropsNUL(t *testing.T) {
	buf := append([]byte{0x03}, 'a', 0x00, 'b')

	offset := 0
	got, err := ReadString(buf, &offset)
	if err != nil {
		t.Fatalf("ReadString() error = %v", err)
	}
	if got != "ab" {
		t.Errorf("ReadString() = %q, want %q (NUL cannot be stored in a text column)", got, "ab")
	}
}

func TestReadStringTruncated(t *testing.T) {
	// A length byte promising more than the packet holds.
	buf := []byte{0x05, 'a', 'b'}

	offset := 0
	if _, err := ReadString(buf, &offset); !errors.Is(err, ErrShortPacket) {
		t.Fatalf("ReadString() error = %v, want ErrShortPacket", err)
	}
}

func TestReadInt32BE(t *testing.T) {
	tests := []struct {
		name string
		buf  []byte
		want int32
	}{
		{"zero", []byte{0, 0, 0, 0}, 0},
		{"positive", []byte{0x00, 0x00, 0x01, 0x00}, 256},
		{"negative", []byte{0xFF, 0xFF, 0xFF, 0xFF}, -1},
		{"max", []byte{0x7F, 0xFF, 0xFF, 0xFF}, 2147483647},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			offset := 0
			got, err := ReadInt32BE(tc.buf, &offset)
			if err != nil {
				t.Fatalf("ReadInt32BE() error = %v", err)
			}
			if got != tc.want {
				t.Errorf("ReadInt32BE() = %d, want %d", got, tc.want)
			}
			if offset != 4 {
				t.Errorf("offset = %d, want 4", offset)
			}
		})
	}
}

func TestReadInt32BETruncated(t *testing.T) {
	offset := 0
	if _, err := ReadInt32BE([]byte{0x00, 0x01}, &offset); !errors.Is(err, ErrShortPacket) {
		t.Fatalf("ReadInt32BE() error = %v, want ErrShortPacket", err)
	}
}

func TestReadUint8(t *testing.T) {
	offset := 0
	got, err := ReadUint8([]byte{0xFE}, &offset)
	if err != nil {
		t.Fatalf("ReadUint8() error = %v", err)
	}
	if got != 0xFE {
		t.Errorf("ReadUint8() = %#x, want 0xFE", got)
	}

	if _, err := ReadUint8([]byte{0xFE}, &offset); !errors.Is(err, ErrShortPacket) {
		t.Fatalf("ReadUint8() past the end: error = %v, want ErrShortPacket", err)
	}
}
