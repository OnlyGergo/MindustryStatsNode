package processor

import (
	"strconv"
	"strings"
)

// orderedByServer is a JavaScript Map keyed by server id: one value per server,
// the newest write wins, and iteration follows first-insertion order.
//
// Go maps have no order, and what these collections hold is exactly the payload
// the database sees, so the order is kept explicitly -- it makes a run
// reproducible and a dry-run diff against the TS writer readable.
type orderedByServer[T any] struct {
	index  map[int]int
	values []T
}

func newOrderedByServer[T any]() *orderedByServer[T] {
	return &orderedByServer[T]{index: make(map[int]int)}
}

func (o *orderedByServer[T]) set(serverID int, value T) {
	if i, ok := o.index[serverID]; ok {
		o.values[i] = value
		return
	}
	o.index[serverID] = len(o.values)
	o.values = append(o.values, value)
}

func (o *orderedByServer[T]) all() []T { return o.values }
func (o *orderedByServer[T]) len() int { return len(o.values) }

func joinInts(ids []int) string {
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = strconv.Itoa(id)
	}
	return strings.Join(parts, ", ")
}
