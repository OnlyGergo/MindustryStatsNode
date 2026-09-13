package poller

import (
	"encoding/binary"
	"fmt"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/mindustry"
)

// ErrShortPacket means the packet ended in the middle of a field.  The TS code
// let Buffer's own range error escape into the try/catch around the whole
// decode; here every read reports it explicitly.
var ErrShortPacket = fmt.Errorf("packet truncated")

// ReadString reads a byte-length-prefixed UTF-8 string.
func ReadString(buf []byte, offset *int) (string, error) {
	length, err := ReadUint8(buf, offset)
	if *offset >= len(buf) {
		// Java uses `buffer[offset.value] & 0xff`, so here we mask to 0-255
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if length == 0 {
		return "", nil
	}
	end := *offset + int(length)
	if end > len(buf) {
		return "", fmt.Errorf("%w: string of %d byte(s) at offset %d", ErrShortPacket, length, *offset)
	}
	s := string(buf[*offset:end])
	*offset = end
	return mindustry.SanitizeText(s), nil
}

// ReadUint8 reads one byte, masked to 0-255 as `buffer[o] & 0xFF` did.
func ReadUint8(buf []byte, offset *int) (uint8, error) {
	if *offset >= len(buf) {
		return 0, fmt.Errorf("%w: byte at offset %d", ErrShortPacket, *offset)
	}
	b := buf[*offset]
	*offset++
	return b, nil
}

// ReadInt32BE reads a big-endian signed 32-bit integer, as readInt32BE did.
func ReadInt32BE(buf []byte, offset *int) (int32, error) {
	if *offset+4 > len(buf) {
		return 0, fmt.Errorf("%w: int32 at offset %d", ErrShortPacket, *offset)
	}
	v := int32(binary.BigEndian.Uint32(buf[*offset : *offset+4]))
	*offset += 4
	return v, nil
}
