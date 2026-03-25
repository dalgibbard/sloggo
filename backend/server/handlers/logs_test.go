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
		"src":   "10.0.0.1",
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

	cefFilter, err := json.Marshal(map[string]string{"src": "10.0.0.1"})
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
	if entry.ParsedCEFExtensions["src"] != "10.0.0.1" {
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

func clearLogsTable(t *testing.T) {
	t.Helper()

	if _, err := db.GetDBInstance().Exec("DELETE FROM logs"); err != nil {
		t.Fatalf("clear logs: %v", err)
	}
}
