package formats

import (
	"encoding/json"
	"errors"
	"strings"

	"sloggo/models"
	"sloggo/utils"
)

type cefMessage struct {
	Version       string
	DeviceVendor  string
	DeviceProduct string
	DeviceVersion string
	SignatureID   string
	Name          string
	Severity      string
	Extensions    map[string]string
}

// EnrichLogEntryWithCEF parses CEF from the syslog message body when present.
func EnrichLogEntryWithCEF(entry *models.LogEntry) error {
	if entry == nil {
		return errors.New("nil log entry")
	}
	if !utils.CEFEnabled {
		return nil
	}

	message := strings.TrimSpace(entry.Message)
	if !strings.HasPrefix(message, "CEF:") {
		return nil
	}

	cef, err := parseCEF(message)
	if err != nil {
		return err
	}

	extensionsJSON, err := json.Marshal(cef.Extensions)
	if err != nil {
		return err
	}

	entry.Format = "cef"
	entry.CEFVersion = cef.Version
	entry.CEFDeviceVendor = cef.DeviceVendor
	entry.CEFDeviceProduct = cef.DeviceProduct
	entry.CEFDeviceVersion = cef.DeviceVersion
	entry.CEFSignatureID = cef.SignatureID
	entry.CEFName = cef.Name
	entry.CEFSeverity = cef.Severity
	entry.CEFExtensions = string(extensionsJSON)
	entry.ParsedCEFExtensions = cef.Extensions

	return nil
}

func parseCEF(message string) (*cefMessage, error) {
	const prefix = "CEF:"
	if !strings.HasPrefix(message, prefix) {
		return nil, errors.New("not cef format")
	}

	header, extension, err := splitCEFHeaderAndExtension(message[len(prefix):])
	if err != nil {
		return nil, err
	}

	extensions, err := parseCEFExtension(extension)
	if err != nil {
		return nil, err
	}

	return &cefMessage{
		Version:       header[0],
		DeviceVendor:  header[1],
		DeviceProduct: header[2],
		DeviceVersion: header[3],
		SignatureID:   header[4],
		Name:          header[5],
		Severity:      header[6],
		Extensions:    extensions,
	}, nil
}

func splitCEFHeaderAndExtension(input string) (fields []string, extension string, err error) {
	fields = make([]string, 0, 7)
	var current strings.Builder

	for i := 0; i < len(input); i++ {
		ch := input[i]
		switch ch {
		case '\\':
			if i+1 >= len(input) {
				current.WriteByte(ch)
				continue
			}
			i++
			current.WriteByte(decodeCEFChar(input[i]))
		case '|':
			if len(fields) < 6 {
				fields = append(fields, current.String())
				current.Reset()
				continue
			}

			fields = append(fields, current.String())
			return fields, input[i+1:], nil
		default:
			current.WriteByte(ch)
		}
	}

	if len(fields) == 6 {
		fields = append(fields, current.String())
		return fields, "", nil
	}

	return nil, "", errors.New("invalid cef header")
}

func parseCEFExtension(extension string) (map[string]string, error) {
	extensions := make(map[string]string)
	extension = strings.TrimSpace(extension)
	if extension == "" {
		return extensions, nil
	}

	for i := 0; i < len(extension); {
		for i < len(extension) && extension[i] == ' ' {
			i++
		}
		if i >= len(extension) {
			break
		}

		keyStart := i
		for i < len(extension) && extension[i] != '=' && extension[i] != ' ' {
			i++
		}
		if i >= len(extension) || extension[i] != '=' {
			return nil, errors.New("invalid cef extension key")
		}

		key := extension[keyStart:i]
		if key == "" {
			return nil, errors.New("empty cef extension key")
		}
		i++

		value, next := readCEFExtensionValue(extension, i)
		extensions[key] = value
		i = next
	}

	return extensions, nil
}

func readCEFExtensionValue(input string, start int) (value string, next int) {
	var current strings.Builder

	for i := start; i < len(input); i++ {
		ch := input[i]
		if ch == '\\' {
			if i+1 >= len(input) {
				current.WriteByte(ch)
				return current.String(), len(input)
			}

			i++
			current.WriteByte(decodeCEFChar(input[i]))
			continue
		}

		if ch != ' ' {
			current.WriteByte(ch)
			continue
		}

		spaceStart := i
		for i < len(input) && input[i] == ' ' {
			i++
		}

		if looksLikeNextCEFKey(input, i) {
			for preserve := 0; preserve < i-spaceStart-1; preserve++ {
				current.WriteByte(' ')
			}
			return current.String(), i
		}

		for preserve := 0; preserve < i-spaceStart; preserve++ {
			current.WriteByte(' ')
		}
		i--
	}

	return current.String(), len(input)
}

func looksLikeNextCEFKey(input string, start int) bool {
	if start >= len(input) {
		return false
	}

	for i := start; i < len(input); i++ {
		switch input[i] {
		case '\\':
			if i+1 >= len(input) {
				return false
			}
			i++
		case '=':
			return i > start
		case ' ':
			return false
		}
	}

	return false
}

func decodeCEFChar(ch byte) byte {
	switch ch {
	case 'n':
		return '\n'
	case 'r':
		return '\r'
	default:
		return ch
	}
}
