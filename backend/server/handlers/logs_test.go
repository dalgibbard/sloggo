package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sloggo/db"
	"sloggo/models"
	"testing"
	"time"
)

func TestLogsHandlerReturnsCEFFieldsAndMetadata(t *testing.T) {
	clearLogsTable(t)

	cefExtensions, err := json.Marshal(map[string]string{
		"src":   "198.51.100.10",
		"proto": "udp",
	})
	if err != nil {
		t.Fatalf("marshal cef extensions: %v", err)
	}

	for _, entry := range []models.LogEntry{
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
			Timestamp:      time.Now().UTC(),
			Hostname:       "syslog-host",
			AppName:        "collector",
			ProcID:         "2",
			MsgID:          "plain-1",
			StructuredData: "-",
			Message:        "plain syslog payload",
			Format:         "syslog",
		},
	} {
		if err := db.StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := db.ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	cefFilter, err := json.Marshal(map[string]string{"src": "198.51.100.10"})
	if err != nil {
		t.Fatalf("marshal cef filter: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs?format=cef&cefSeverity=10&cefExt="+url.QueryEscape(string(cefFilter)), nil)
	w := httptest.NewRecorder()

	LogsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response LogsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Fatalf("expected one cef log, got %d", len(response.Data))
	}

	entry := response.Data[0]
	if entry.Format != "cef" {
		t.Fatalf("expected cef format, got %q", entry.Format)
	}
	if entry.CEFName != "worm successfully stopped" {
		t.Fatalf("expected cef name, got %q", entry.CEFName)
	}
	if entry.ParsedCEFExtensions["src"] != "198.51.100.10" {
		t.Fatalf("expected src extension, got %q", entry.ParsedCEFExtensions["src"])
	}

	keys, ok := response.Meta.Metadata["cefExtensionKeys"].([]any)
	if !ok {
		t.Fatalf("expected cefExtensionKeys metadata, got %#v", response.Meta.Metadata["cefExtensionKeys"])
	}
	if len(keys) != 2 {
		t.Fatalf("expected two extension keys, got %d", len(keys))
	}
}

func TestLogsHandlerSupportsExcludedStringFilters(t *testing.T) {
	clearLogsTable(t)

	for _, entry := range []models.LogEntry{
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
	} {
		if err := db.StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := db.ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs?hostname=%21drop-host", nil)
	w := httptest.NewRecorder()

	LogsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response LogsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Fatalf("expected one log, got %d", len(response.Data))
	}
	if response.Data[0].Hostname != "keep-host" {
		t.Fatalf("expected keep-host, got %q", response.Data[0].Hostname)
	}
}

func TestLogsHandlerReturnsMessageFieldsAndMetadata(t *testing.T) {
	clearLogsTable(t)

	for _, entry := range []models.LogEntry{
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
			Message:        `{"type":"dnsAdBlock","protocol":"udp","src_port":4287}`,
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
	} {
		if err := db.StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := db.ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	msgFilter, err := json.Marshal(map[string]string{"type": "dnsAdBlock"})
	if err != nil {
		t.Fatalf("marshal message field filter: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs?msgField="+url.QueryEscape(string(msgFilter)), nil)
	w := httptest.NewRecorder()

	LogsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response LogsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Fatalf("expected one JSON log, got %d", len(response.Data))
	}

	entry := response.Data[0]
	if entry.Hostname != "json-host" {
		t.Fatalf("expected json-host, got %q", entry.Hostname)
	}
	if entry.ParsedMessageFields["type"] != "dnsAdBlock" {
		t.Fatalf("expected type field, got %q", entry.ParsedMessageFields["type"])
	}
	if entry.ParsedMessageFields["src_port"] != "4287" {
		t.Fatalf("expected src_port field, got %q", entry.ParsedMessageFields["src_port"])
	}

	keys, ok := response.Meta.Metadata["messageFieldKeys"].([]any)
	if !ok {
		t.Fatalf("expected messageFieldKeys metadata, got %#v", response.Meta.Metadata["messageFieldKeys"])
	}
	if len(keys) != 3 {
		t.Fatalf("expected three message field keys, got %d", len(keys))
	}
}

func TestLogsHandlerSupportsExcludedMessageFieldFilters(t *testing.T) {
	clearLogsTable(t)

	for _, entry := range []models.LogEntry{
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
			Message:        `{"type":"dnsAdBlock","category":"ADVERTISEMENT"}`,
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
			Message:        `{"type":"dnsAllow","category":"SECURITY"}`,
			Format:         "syslog",
		},
	} {
		if err := db.StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := db.ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	msgFilter, err := json.Marshal(map[string]string{"type": "!dnsAdBlock"})
	if err != nil {
		t.Fatalf("marshal message field filter: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs?msgField="+url.QueryEscape(string(msgFilter)), nil)
	w := httptest.NewRecorder()

	LogsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response LogsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Fatalf("expected one excluded message-field log, got %d", len(response.Data))
	}
	if response.Data[0].Hostname != "allowed-host" {
		t.Fatalf("expected allowed-host, got %q", response.Data[0].Hostname)
	}
}

func TestLogsHandlerSupportsPartialAndExcludedMessageFilters(t *testing.T) {
	clearLogsTable(t)

	for _, entry := range []models.LogEntry{
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
	} {
		if err := db.StoreLog(entry); err != nil {
			t.Fatalf("store log entry: %v", err)
		}
	}
	if err := db.ProcessBatchStoreLogs(); err != nil {
		t.Fatalf("process batch: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs?message="+url.QueryEscape("not found"), nil)
	w := httptest.NewRecorder()

	LogsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response LogsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Fatalf("expected one partial-match log, got %d", len(response.Data))
	}
	if response.Data[0].Hostname != "flow-host" {
		t.Fatalf("expected flow-host, got %q", response.Data[0].Hostname)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs?message="+url.QueryEscape("!flow not found"), nil)
	w = httptest.NewRecorder()

	LogsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	response = LogsResponse{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(response.Data) != 1 {
		t.Fatalf("expected one excluded partial-match log, got %d", len(response.Data))
	}
	if response.Data[0].Hostname != "keep-host" {
		t.Fatalf("expected keep-host after exclusion, got %q", response.Data[0].Hostname)
	}
}

func clearLogsTable(t *testing.T) {
	t.Helper()

	if _, err := db.GetDBInstance().Exec("DELETE FROM logs"); err != nil {
		t.Fatalf("clear logs: %v", err)
	}
}
