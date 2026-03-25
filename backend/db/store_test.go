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
			VALUES (5, 1, 1, ?, 'legacy-host', 'legacy-app', '123', 'legacy-id', '-', 'legacy message')
		`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	if err := ensureLogsTableSchema(logsTableName); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}

	columns, err := getTableColumns(logsTableName)
	if err != nil {
		t.Fatalf("get table columns: %v", err)
	}

	for _, column := range []string{"format", "cef_version", "cef_device_vendor", "cef_extensions"} {
		if !slices.Contains(columns, column) {
			t.Fatalf("expected migrated column %q", column)
		}
	}

	var format string
	if err := db.QueryRowContext(context.Background(), `SELECT format FROM logs WHERE hostname = 'legacy-host'`).Scan(&format); err != nil {
		t.Fatalf("query migrated row: %v", err)
	}
	if format != "syslog" {
		t.Fatalf("expected migrated format syslog, got %q", format)
	}

	setupDatabaseTable(logsTableName)
}

func TestGetLogsWithCEFFilters(t *testing.T) {
	resetLogsTable(t)

	cefExtensions, err := json.Marshal(map[string]string{
		"src":   "10.0.0.1",
		"dst":   "2.1.2.2",
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
			"src":   "10.0.0.1",
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

func TestGetCEFExtensionKeys(t *testing.T) {
	resetLogsTable(t)

	for _, entry := range []models.LogEntry{
		newCEFEntry("cef-1", map[string]string{"src": "10.0.0.1", "dst": "2.1.2.2"}),
		newCEFEntry("cef-2", map[string]string{"src": "10.0.0.2", "proto": "udp"}),
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
	setupDatabaseTable(logsTableName)
	if _, err := GetDBInstance().ExecContext(context.Background(), "DELETE FROM logs"); err != nil {
		t.Fatalf("delete logs: %v", err)
	}
}

func resetBatchLogs() {
	batchLogsMutex.Lock()
	defer batchLogsMutex.Unlock()
	batchLogs = make([]models.LogEntry, 0, maxBatchStoreLogsSize)
}
