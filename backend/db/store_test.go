package db

import (
	"context"
	"encoding/json"
	"slices"
	"sloggo/models"
	"testing"
	"time"
)

func TestStoreLogEntry(t *testing.T) {
	resetLogsTable(t)

	entry := models.LogEntry{
		Severity:       5,
		Facility:       1,
		Version:        1,
		Timestamp:      time.Now().UTC(),
		Hostname:       "test-host",
		AppName:        "test-app",
		ProcID:         "1234",
		MsgID:          "5678",
		StructuredData: "-",
		Message:        "Test message",
		Format:         "syslog",
	}

	if err := StoreLog(entry); err != nil {
		t.Fatalf("store log entry: %v", err)
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	rows, err := GetDBInstance().QueryContext(context.Background(), `
			SELECT severity, facility, version, hostname, app_name, procid, msgid, structured_data, msg, format
			FROM logs
			WHERE hostname = ? AND app_name = ? AND msg = ?
	`, entry.Hostname, entry.AppName, entry.Message)
	if err != nil {
		t.Fatalf("query database: %v", err)
	}
	defer rows.Close()

	if !rows.Next() {
		t.Fatal("expected log entry not found in database")
	}

	var severity, facility uint8
	var version uint16
	var hostname, appName, procID, msgID, structuredData, message, format string

	if err := rows.Scan(&severity, &facility, &version, &hostname, &appName, &procID, &msgID, &structuredData, &message, &format); err != nil {
		t.Fatalf("scan row: %v", err)
	}

	if severity != entry.Severity || facility != entry.Facility || version != entry.Version {
		t.Fatalf("unexpected core fields: severity=%d facility=%d version=%d", severity, facility, version)
	}
	if hostname != entry.Hostname || appName != entry.AppName || procID != entry.ProcID || msgID != entry.MsgID {
		t.Fatalf("unexpected identity fields")
	}
	if structuredData != entry.StructuredData || message != entry.Message || format != entry.Format {
		t.Fatalf("unexpected message fields")
	}
}

func TestBatchProcessing(t *testing.T) {
	resetLogsTable(t)

	entries := []models.LogEntry{
		{
			Severity:       3,
			Facility:       2,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "batch-host-1",
			AppName:        "batch-app",
			ProcID:         "100",
			MsgID:          "MSG1",
			StructuredData: "-",
			Message:        "Batch message 1",
			Format:         "syslog",
		},
		{
			Severity:       4,
			Facility:       3,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "batch-host-2",
			AppName:        "batch-app",
			ProcID:         "200",
			MsgID:          "MSG2",
			StructuredData: "-",
			Message:        "Batch message 2",
			Format:         "syslog",
		},
		{
			Severity:       5,
			Facility:       4,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "batch-host-3",
			AppName:        "batch-app",
			ProcID:         "300",
			MsgID:          "MSG3",
			StructuredData: "-",
			Message:        "Batch message 3",
			Format:         "syslog",
		},
	}

	for _, entry := range entries {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}

	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	row := GetDBInstance().QueryRowContext(context.Background(), `SELECT COUNT(*) FROM logs WHERE app_name = ?`, "batch-app")
	var count int
	if err := row.Scan(&count); err != nil {
		t.Fatalf("scan count: %v", err)
	}

	if count != len(entries) {
		t.Fatalf("expected %d entries, got %d", len(entries), count)
	}
}

func TestEnsureLogsTableSchemaMigratesOldTable(t *testing.T) {
	resetBatchLogs()

	db := GetDBInstance()
	if _, err := db.ExecContext(context.Background(), "DROP TABLE IF EXISTS logs"); err != nil {
		t.Fatalf("drop table: %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `
			CREATE TABLE logs (
				severity INTEGER NOT NULL,
				facility INTEGER NOT NULL,
			version INTEGER NOT NULL DEFAULT 1,
			timestamp TIMESTAMP NOT NULL,
			hostname TEXT NOT NULL,
			app_name TEXT NOT NULL,
			procid TEXT,
			msgid TEXT,
			structured_data TEXT,
			msg TEXT
		);
	`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `
			INSERT INTO logs (severity, facility, version, timestamp, hostname, app_name, procid, msgid, structured_data, msg)
			VALUES (5, 1, 1, ?, 'legacy-host', 'legacy-app', '123', 'legacy-id', '-', '{"type":"dnsAdBlock","protocol":"udp"}')
		`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	if err := ensureLogsTableSchema(); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	columns, err := getTableColumns(logsTableName)
	if err != nil {
		t.Fatalf("get table columns: %v", err)
	}

	for _, column := range []string{"message_fields", "format", "cef_version", "cef_device_vendor", "cef_extensions"} {
		if !slices.Contains(columns, column) {
			t.Fatalf("expected migrated column %q", column)
		}
	}

	var format, messageFields string
	if err := db.QueryRowContext(context.Background(), `SELECT format, message_fields FROM logs WHERE hostname = 'legacy-host'`).Scan(&format, &messageFields); err != nil {
		t.Fatalf("query migrated row: %v", err)
	}
	if format != "syslog" {
		t.Fatalf("expected migrated format syslog, got %q", format)
	}
	if messageFields == "" {
		t.Fatal("expected migrated message fields to be backfilled")
	}

	setupDatabaseTable()
}

func TestEnsureLogsTableSchemaNormalizesPlainMessageFields(t *testing.T) {
	resetBatchLogs()

	db := GetDBInstance()
	if _, err := db.ExecContext(context.Background(), "DROP TABLE IF EXISTS logs"); err != nil {
		t.Fatalf("drop table: %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `
			CREATE TABLE logs (
				severity INTEGER NOT NULL,
				facility INTEGER NOT NULL,
				version INTEGER NOT NULL DEFAULT 1,
				timestamp TIMESTAMP NOT NULL,
				hostname TEXT NOT NULL,
				app_name TEXT NOT NULL,
				procid TEXT,
				msgid TEXT,
				structured_data TEXT,
				msg TEXT
			);
	`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `
			INSERT INTO logs (severity, facility, version, timestamp, hostname, app_name, procid, msgid, structured_data, msg)
			VALUES (5, 1, 1, ?, 'plain-host', 'legacy-app', '123', 'legacy-id', '-', 'plain syslog payload')
		`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	if err := ensureLogsTableSchema(); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	var messageFields string
	if err := db.QueryRowContext(context.Background(), `SELECT message_fields FROM logs WHERE hostname = 'plain-host'`).Scan(&messageFields); err != nil {
		t.Fatalf("query migrated row: %v", err)
	}
	if messageFields != "" {
		t.Fatalf("expected plain message fields to normalize to empty string, got %q", messageFields)
	}

	setupDatabaseTable()
}

func TestStoreLogEntryHandlesLegacyColumnOrder(t *testing.T) {
	resetBatchLogs()

	db := GetDBInstance()
	if _, err := db.ExecContext(context.Background(), "DROP TABLE IF EXISTS logs"); err != nil {
		t.Fatalf("drop table: %v", err)
	}
	if _, err := db.ExecContext(context.Background(), `
			CREATE TABLE logs (
				severity INTEGER NOT NULL,
				facility INTEGER NOT NULL,
				version INTEGER NOT NULL DEFAULT 1,
				timestamp TIMESTAMP NOT NULL,
				hostname TEXT NOT NULL,
				app_name TEXT NOT NULL,
				procid TEXT,
				msgid TEXT,
				structured_data TEXT,
				msg TEXT,
				format TEXT NOT NULL DEFAULT 'syslog',
				cef_version TEXT,
				cef_device_vendor TEXT,
				cef_device_product TEXT,
				cef_device_version TEXT,
				cef_signature_id TEXT,
				cef_name TEXT,
				cef_severity TEXT,
				cef_extensions TEXT
			);
	`); err != nil {
		t.Fatalf("create legacy cef table: %v", err)
	}

	if err := ensureLogsTableSchema(); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	entry := models.LogEntry{
		Severity:       6,
		Facility:       16,
		Version:        1,
		Timestamp:      time.Now().UTC(),
		Hostname:       "json-host",
		AppName:        "collector",
		ProcID:         "1",
		MsgID:          "json-1",
		StructuredData: "-",
		Message:        `{"type":"dnsAdBlock","protocol":"udp"}`,
		Format:         "syslog",
	}

	if err := StoreLog(entry); err != nil {
		t.Fatalf("store log entry: %v", err)
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	var format, messageFields string
	if err := db.QueryRowContext(context.Background(), `
			SELECT format, message_fields
			FROM logs
			WHERE hostname = 'json-host'
		`).Scan(&format, &messageFields); err != nil {
		t.Fatalf("query stored row: %v", err)
	}

	if format != "syslog" {
		t.Fatalf("expected syslog format, got %q", format)
	}
	if messageFields == "" {
		t.Fatal("expected message fields to be stored for legacy column order")
	}

	logs, _, _, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"hostname": "json-host",
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("expected one log, got %d", len(logs))
	}
	if logs[0].Format != "syslog" {
		t.Fatalf("expected API format syslog, got %q", logs[0].Format)
	}
	if logs[0].Message != entry.Message {
		t.Fatalf("expected message to round-trip, got %q", logs[0].Message)
	}

	setupDatabaseTable()
}

func TestGetLogsHandlesNullMessageFields(t *testing.T) {
	resetBatchLogs()

	db := GetDBInstance()
	if _, err := db.ExecContext(context.Background(), "DROP TABLE IF EXISTS logs"); err != nil {
		t.Fatalf("drop table: %v", err)
	}
	setupDatabaseTable()

	if _, err := db.ExecContext(context.Background(), `
			INSERT INTO logs (
				severity, facility, version, timestamp, hostname, app_name,
				procid, msgid, structured_data, msg, message_fields,
				cef_version, cef_device_vendor, cef_device_product, cef_device_version,
				cef_signature_id, cef_name, cef_severity, cef_extensions
			)
			VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
		`,
		6, 16, 1, time.Now().UTC().Format(time.RFC3339Nano), "legacy-host", "legacy-app", "plain syslog payload",
	); err != nil {
		t.Fatalf("insert row with null message fields: %v", err)
	}

	logs, totalCount, filterCount, err := GetLogs(10, time.Time{}, "next", nil, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs: %v", err)
	}

	if totalCount != 1 || filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one log, got total=%d filtered=%d len=%d", totalCount, filterCount, len(logs))
	}
	if logs[0].MessageFields != "" {
		t.Fatalf("expected empty message fields, got %q", logs[0].MessageFields)
	}
	if logs[0].Format != "syslog" {
		t.Fatalf("expected default syslog format, got %q", logs[0].Format)
	}
}

func TestGetLogsWithCEFFilters(t *testing.T) {
	resetLogsTable(t)

	cefExtensions, err := json.Marshal(map[string]string{
		"src":   "198.51.100.10",
		"dst":   "203.0.113.20",
		"proto": "udp",
	})
	if err != nil {
		t.Fatalf("marshal cef extensions: %v", err)
	}

	entries := []models.LogEntry{
		{
			Severity:         4,
			Facility:         16,
			Version:          1,
			Timestamp:        time.Now().UTC(),
			Hostname:         "cef-host",
			AppName:          "collector",
			ProcID:           "1",
			MsgID:            "cef-1",
			StructuredData:   "-",
			Message:          "CEF payload",
			Format:           "cef",
			CEFVersion:       "0",
			CEFDeviceVendor:  "Security",
			CEFDeviceProduct: "threatmanager",
			CEFDeviceVersion: "1.0",
			CEFSignatureID:   "100",
			CEFName:          "worm successfully stopped",
			CEFSeverity:      "10",
			CEFExtensions:    string(cefExtensions),
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "syslog-host",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "plain-1",
			StructuredData: "-",
			Message:        "plain syslog payload",
			Format:         "syslog",
		},
	}

	for _, entry := range entries {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	logs, totalCount, filterCount, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"format":           "cef",
		"cefDeviceVendor":  "Security",
		"cefDeviceProduct": "threatmanager",
		"cefSeverity":      "10",
		"cefExt": map[string]string{
			"src":   "198.51.100.10",
			"proto": "udp",
		},
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs: %v", err)
	}

	if totalCount != 2 {
		t.Fatalf("expected total count 2, got %d", totalCount)
	}
	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one filtered cef log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Format != "cef" || logs[0].CEFName != "worm successfully stopped" {
		t.Fatalf("unexpected filtered log: %+v", logs[0])
	}
}

func TestGetLogsWithMultipleStringFilters(t *testing.T) {
	resetLogsTable(t)

	for _, entry := range []models.LogEntry{
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "dhcpv6-host",
			AppName:        "odhcp6c",
			ProcID:         "1",
			MsgID:          "dhcpv6-1",
			StructuredData: "-",
			Message:        "dhcpv6 client log",
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "dns-host",
			AppName:        "dnsmasq",
			ProcID:         "2",
			MsgID:          "dns-1",
			StructuredData: "-",
			Message:        "dns resolver log",
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-2 * time.Minute),
			Hostname:       "core-host",
			AppName:        "coredns",
			ProcID:         "3",
			MsgID:          "core-1",
			StructuredData: "-",
			Message:        "core dns log",
			Format:         "syslog",
		},
	} {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	logs, _, _, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"appName": []string{"!odhcp6c", "!dnsmasq"},
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with excluded app filters: %v", err)
	}

	if len(logs) != 1 {
		t.Fatalf("expected one remaining log after exclusions, got %d", len(logs))
	}
	if logs[0].AppName != "coredns" {
		t.Fatalf("expected coredns log, got %q", logs[0].AppName)
	}

	logs, _, _, err = GetLogs(10, time.Time{}, "next", map[string]any{
		"appName": []string{"odhcp6c", "dnsmasq"},
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with included app filters: %v", err)
	}

	if len(logs) != 2 {
		t.Fatalf("expected two included logs, got %d", len(logs))
	}
	if !slices.Equal(
		[]string{logs[0].AppName, logs[1].AppName},
		[]string{"odhcp6c", "dnsmasq"},
	) && !slices.Equal(
		[]string{logs[0].AppName, logs[1].AppName},
		[]string{"dnsmasq", "odhcp6c"},
	) {
		t.Fatalf("unexpected app names returned: %q, %q", logs[0].AppName, logs[1].AppName)
	}
}

func TestGetCEFExtensionKeys(t *testing.T) {
	resetLogsTable(t)

	for _, entry := range []models.LogEntry{
		newCEFEntry("cef-1", map[string]string{"src": "198.51.100.10", "dst": "203.0.113.20"}),
		newCEFEntry("cef-2", map[string]string{"src": "198.51.100.11", "proto": "udp"}),
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "syslog-host",
			AppName:        "collector",
			ProcID:         "3",
			MsgID:          "plain-1",
			StructuredData: "-",
			Message:        "plain syslog payload",
			Format:         "syslog",
		},
	} {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	keys, err := GetCEFExtensionKeys(map[string]any{"format": "cef"})
	if err != nil {
		t.Fatalf("get cef extension keys: %v", err)
	}

	expected := []string{"dst", "proto", "src"}
	if len(keys) != len(expected) {
		t.Fatalf("expected keys %v, got %v", expected, keys)
	}
	for i, key := range expected {
		if keys[i] != key {
			t.Fatalf("expected key %q at index %d, got %q", key, i, keys[i])
		}
	}
}

func TestGetLogsWithMessageFieldFilters(t *testing.T) {
	resetLogsTable(t)

	jsonMessage := `{"type":"dnsAdBlock","category":"ADVERTISEMENT","src_port":4287,"protocol":"udp"}`

	entries := []models.LogEntry{
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "json-host",
			AppName:        "collector",
			ProcID:         "1",
			MsgID:          "json-1",
			StructuredData: "-",
			Message:        jsonMessage,
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "plain-host",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "plain-1",
			StructuredData: "-",
			Message:        "plain syslog payload",
			Format:         "syslog",
		},
	}

	for _, entry := range entries {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	logs, totalCount, filterCount, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"msgField": map[string]string{
			"type":     "dnsAdBlock",
			"protocol": "udp",
		},
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs: %v", err)
	}

	if totalCount != 2 {
		t.Fatalf("expected total count 2, got %d", totalCount)
	}
	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one filtered JSON log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Hostname != "json-host" {
		t.Fatalf("expected json-host, got %q", logs[0].Hostname)
	}
	if logs[0].MessageFields == "" {
		t.Fatal("expected message fields to be stored")
	}
}

func TestGetMessageFieldKeys(t *testing.T) {
	resetLogsTable(t)

	for _, entry := range []models.LogEntry{
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "json-host-1",
			AppName:        "collector",
			ProcID:         "1",
			MsgID:          "json-1",
			StructuredData: "-",
			Message:        `{"type":"dnsAdBlock","protocol":"udp"}`,
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "json-host-2",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "json-2",
			StructuredData: "-",
			Message:        `{"type":"dnsAllow","src_ip":"198.51.100.17"}`,
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-2 * time.Minute),
			Hostname:       "plain-host",
			AppName:        "collector",
			ProcID:         "3",
			MsgID:          "plain-1",
			StructuredData: "-",
			Message:        "plain syslog payload",
			Format:         "syslog",
		},
	} {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	keys, err := GetMessageFieldKeys(nil)
	if err != nil {
		t.Fatalf("get message field keys: %v", err)
	}

	expected := []string{"protocol", "src_ip", "type"}
	if len(keys) != len(expected) {
		t.Fatalf("expected keys %v, got %v", expected, keys)
	}
	for i, key := range expected {
		if keys[i] != key {
			t.Fatalf("expected key %q at index %d, got %q", key, i, keys[i])
		}
	}
}

func TestGetLogsWithExcludedAndWildcardMessageFieldFilters(t *testing.T) {
	resetLogsTable(t)

	entries := []models.LogEntry{
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "blocked-host",
			AppName:        "collector",
			ProcID:         "1",
			MsgID:          "json-1",
			StructuredData: "-",
			Message:        `{"type":"dnsAdBlock","category":"ADVERTISEMENT","protocol":"udp"}`,
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "allowed-host",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "json-2",
			StructuredData: "-",
			Message:        `{"type":"dnsAllow","category":"SECURITY","protocol":"tcp"}`,
			Format:         "syslog",
		},
	}

	for _, entry := range entries {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	logs, _, filterCount, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"msgField": map[string]string{
			"type": "!dnsAdBlock",
		},
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with excluded message field filter: %v", err)
	}

	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one excluded message-field log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Hostname != "allowed-host" {
		t.Fatalf("expected allowed-host, got %q", logs[0].Hostname)
	}

	logs, _, filterCount, err = GetLogs(10, time.Time{}, "next", map[string]any{
		"msgField": map[string]string{
			"category": "ADVERT*",
		},
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with wildcard message field filter: %v", err)
	}

	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one wildcard message-field log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Hostname != "blocked-host" {
		t.Fatalf("expected blocked-host, got %q", logs[0].Hostname)
	}
}

func TestGetLogsWithExcludedStringFilter(t *testing.T) {
	resetLogsTable(t)

	entries := []models.LogEntry{
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "keep-host",
			AppName:        "collector",
			ProcID:         "1",
			MsgID:          "keep-1",
			StructuredData: "-",
			Message:        "keep me",
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "drop-host",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "drop-1",
			StructuredData: "-",
			Message:        "drop me",
			Format:         "syslog",
		},
	}

	for _, entry := range entries {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	logs, totalCount, filterCount, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"hostname": "!drop-host",
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs: %v", err)
	}

	if totalCount != 2 {
		t.Fatalf("expected total count 2, got %d", totalCount)
	}
	if filterCount != 1 {
		t.Fatalf("expected filtered count 1, got %d", filterCount)
	}
	if len(logs) != 1 {
		t.Fatalf("expected one log, got %d", len(logs))
	}
	if logs[0].Hostname != "keep-host" {
		t.Fatalf("expected keep-host, got %q", logs[0].Hostname)
	}
}

func TestGetLogsWithPartialAndExcludedMessageFilter(t *testing.T) {
	resetLogsTable(t)

	entries := []models.LogEntry{
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC(),
			Hostname:       "flow-host",
			AppName:        "collector",
			ProcID:         "1",
			MsgID:          "flow-1",
			StructuredData: "-",
			Message:        "packet flow not found for request 42",
			Format:         "syslog",
		},
		{
			Severity:       6,
			Facility:       16,
			Version:        1,
			Timestamp:      time.Now().UTC().Add(-time.Minute),
			Hostname:       "keep-host",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "keep-1",
			StructuredData: "-",
			Message:        "request completed successfully",
			Format:         "syslog",
		},
	}

	for _, entry := range entries {
		if err := StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	logs, _, filterCount, err := GetLogs(10, time.Time{}, "next", map[string]any{
		"message": "not found",
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with partial message filter: %v", err)
	}

	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one partial-match log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Hostname != "flow-host" {
		t.Fatalf("expected flow-host, got %q", logs[0].Hostname)
	}

	logs, _, filterCount, err = GetLogs(10, time.Time{}, "next", map[string]any{
		"message": "!flow not found",
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with excluded partial message filter: %v", err)
	}

	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one excluded partial-match log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Hostname != "keep-host" {
		t.Fatalf("expected keep-host after exclusion, got %q", logs[0].Hostname)
	}

	logs, _, filterCount, err = GetLogs(10, time.Time{}, "next", map[string]any{
		"message": "*flow not found*",
	}, "timestamp", "DESC")
	if err != nil {
		t.Fatalf("get logs with wildcard message filter: %v", err)
	}

	if filterCount != 1 || len(logs) != 1 {
		t.Fatalf("expected one wildcard-match log, got filterCount=%d len=%d", filterCount, len(logs))
	}
	if logs[0].Hostname != "flow-host" {
		t.Fatalf("expected flow-host for wildcard match, got %q", logs[0].Hostname)
	}
}

func newCEFEntry(msgID string, extensions map[string]string) models.LogEntry {
	encodedExtensions, _ := json.Marshal(extensions)

	return models.LogEntry{
		Severity:         4,
		Facility:         16,
		Version:          1,
		Timestamp:        time.Now().UTC(),
		Hostname:         "cef-host",
		AppName:          "collector",
		ProcID:           "1",
		MsgID:            msgID,
		StructuredData:   "-",
		Message:          "CEF payload",
		Format:           "cef",
		CEFVersion:       "0",
		CEFDeviceVendor:  "Security",
		CEFDeviceProduct: "threatmanager",
		CEFDeviceVersion: "1.0",
		CEFSignatureID:   "100",
		CEFName:          "worm successfully stopped",
		CEFSeverity:      "10",
		CEFExtensions:    string(encodedExtensions),
	}
}

func resetLogsTable(t *testing.T) {
	t.Helper()
	resetBatchLogs()

	if _, err := GetDBInstance().ExecContext(context.Background(), "DROP TABLE IF EXISTS logs"); err != nil {
		t.Fatalf("drop table: %v", err)
	}
	setupDatabaseTable()
	if _, err := GetDBInstance().ExecContext(context.Background(), "DELETE FROM logs"); err != nil {
		t.Fatalf("delete logs: %v", err)
	}
}

func resetBatchLogs() {
	batchLogsMutex.Lock()
	defer batchLogsMutex.Unlock()
	batchLogs = make([]models.LogEntry, 0, maxBatchStoreLogsSize)
}
