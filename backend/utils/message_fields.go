package utils

import (
	"encoding/json"
	"io"
	"strconv"
	"strings"
)

// ExtractJSONMessageFields returns top-level scalar fields from a JSON object message.
func ExtractJSONMessageFields(message string) map[string]string {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" || !strings.HasPrefix(trimmed, "{") || !strings.HasSuffix(trimmed, "}") {
		return nil
	}

	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.UseNumber()

	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil {
		return nil
	}

	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil
	}

	fields := make(map[string]string)
	for key, value := range payload {
		stringValue, ok := jsonMessageScalarToString(value)
		if !ok {
			continue
		}

		fields[key] = stringValue
	}

	if len(fields) == 0 {
		return nil
	}

	return fields
}

// EncodeJSONMessageFields returns a JSON string of extracted top-level scalar fields.
func EncodeJSONMessageFields(message string) string {
	fields := ExtractJSONMessageFields(message)
	if len(fields) == 0 {
		return ""
	}

	encoded, err := json.Marshal(fields)
	if err != nil {
		return ""
	}

	return string(encoded)
}

func jsonMessageScalarToString(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return typed, true
	case json.Number:
		return typed.String(), true
	case bool:
		return strconv.FormatBool(typed), true
	default:
		return "", false
	}
}
