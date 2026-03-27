package formats

import (
	"errors"
	"regexp"
	"sloggo/models"
	"strconv"
	"strings"
	"time"
)

var (
	// Example: <34>Oct 11 22:14:15 mymachine su[123]: 'su root' failed
	rfc3164PrefixRegex = regexp.MustCompile(`^<(?P<pri>\d{1,3})>(?P<ts>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(?P<host>\S+)\s+(?P<rest>[\s\S]*)$`)
	// Some devices emit RFC3164-like payloads without the PRI prefix.
	rfc3164WithoutPRIPrefixRegex = regexp.MustCompile(`^(?P<ts>[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(?P<host>\S+)\s+(?P<rest>[\s\S]*)$`)
)

const (
	defaultRFC3164Facility = uint8(1) // user-level messages
	defaultRFC3164Severity = uint8(6) // informational
)

// ParseRFC3164ToLogEntry parses an RFC3164 (BSD) syslog line into a LogEntry
// Best-effort: fills missing fields with defaults compatible with the DB schema
func ParseRFC3164ToLogEntry(line string) (*models.LogEntry, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, errors.New("empty message")
	}

	groups, hasPriority := parseRFC3164Prefix(line)
	if groups == nil {
		return nil, errors.New("not rfc3164 format")
	}

	facility := defaultRFC3164Facility
	severity := defaultRFC3164Severity
	if hasPriority {
		// Priority -> facility/severity
		pri, err := strconv.Atoi(groups["pri"])
		if err != nil {
			return nil, err
		}
		// Validate priority range (0-191)
		if pri < 0 || pri > 191 {
			return nil, errors.New("priority out of range (must be 0-191)")
		}
		priority := uint8(pri)
		facility = priority / 8
		severity = priority % 8
	}

	// Timestamp (no year) e.g. "Oct 11 22:14:15"
	// RFC3164 doesn't include year, so we need to infer it
	now := time.Now()
	tsStr := groups["ts"]
	// time layout with optional leading space in day
	// Jan _2 15:04:05 handles single-digit days
	tsParsed, err := time.ParseInLocation("Jan _2 15:04:05", tsStr, now.Location())
	if err != nil {
		return nil, errors.New("failed to parse timestamp: " + err.Error())
	}

	// Infer year: start with current year
	year := now.Year()
	ts := time.Date(year, tsParsed.Month(), tsParsed.Day(), tsParsed.Hour(), tsParsed.Minute(), tsParsed.Second(), 0, now.Location())

	// Handle year boundary: if it's January and we receive December logs, they're from last year
	if now.Month() == time.January && tsParsed.Month() == time.December {
		year--
		ts = time.Date(year, tsParsed.Month(), tsParsed.Day(), tsParsed.Hour(), tsParsed.Minute(), tsParsed.Second(), 0, now.Location())
	}

	hostname := groups["host"]
	if hostname == "" {
		hostname = "-"
	}

	appName, procID, msg, err := parseRFC3164TagAndMessage(groups["rest"])
	if err != nil {
		return nil, err
	}

	entry := &models.LogEntry{
		Severity:       severity,
		Facility:       facility,
		Version:        1,
		Timestamp:      ts,
		Hostname:       hostname,
		AppName:        appName,
		ProcID:         procID,
		MsgID:          "-",
		StructuredData: "-",
		Message:        msg,
		Format:         "syslog",
	}

	return entry, nil
}

func parseRFC3164TagAndMessage(rest string) (appName string, procID string, msg string, err error) {
	rest = strings.TrimSpace(rest)
	if strings.HasPrefix(rest, "CEF:") {
		return "-", "-", rest, nil
	}

	separatorIndex := strings.IndexByte(rest, ':')
	if separatorIndex == -1 {
		return "", "", "", errors.New("missing rfc3164 tag separator")
	}

	headerPart := strings.TrimSpace(rest[:separatorIndex])
	msg = strings.TrimSpace(rest[separatorIndex+1:])

	headerTokens := strings.Fields(headerPart)
	if len(headerTokens) == 0 {
		return "", "", "", errors.New("missing rfc3164 tag")
	}

	tagToken := headerTokens[len(headerTokens)-1]
	appName, procID = parseRFC3164TagToken(tagToken)
	if appName == "" {
		return "", "", "", errors.New("empty rfc3164 tag")
	}
	if procID == "" {
		procID = "-"
	}

	return appName, procID, msg, nil
}

func parseRFC3164TagToken(tagToken string) (appName string, procID string) {
	tagToken = strings.TrimSpace(tagToken)
	if tagToken == "" {
		return "", ""
	}

	openBracketIndex := strings.LastIndex(tagToken, "[")
	if openBracketIndex > 0 && strings.HasSuffix(tagToken, "]") {
		procID = tagToken[openBracketIndex+1 : len(tagToken)-1]
		if procID != "" {
			return tagToken[:openBracketIndex], procID
		}
	}

	return tagToken, "-"
}

func parseRFC3164Prefix(line string) (groups map[string]string, hasPriority bool) {
	if match := rfc3164PrefixRegex.FindStringSubmatch(line); match != nil {
		return extractRegexGroups(rfc3164PrefixRegex, match), true
	}
	if match := rfc3164WithoutPRIPrefixRegex.FindStringSubmatch(line); match != nil {
		return extractRegexGroups(rfc3164WithoutPRIPrefixRegex, match), false
	}

	return nil, false
}

func extractRegexGroups(pattern *regexp.Regexp, match []string) map[string]string {
	groups := make(map[string]string)
	for i, name := range pattern.SubexpNames() {
		if i != 0 && name != "" {
			groups[name] = match[i]
		}
	}

	return groups
}
