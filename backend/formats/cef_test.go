package formats

import (
	"testing"

	"sloggo/models"

	"github.com/leodido/go-syslog/v4/rfc5424"
)

func TestEnrichLogEntryWithCEFFromRFC5424(t *testing.T) {
	parser := rfc5424.NewParser(rfc5424.WithBestEffort())
	syslogMsg, err := parser.Parse([]byte("<165>1 2023-10-01T12:34:56Z host1 app1 2345 ID01 - CEF:0|Security|threatmanager|1.0|100|worm successfully stopped|10|src=198.51.100.10 dst=203.0.113.20 spt=1232"))
	if err != nil {
		t.Fatalf("parse rfc5424: %v", err)
	}

	rfc5424Msg, ok := syslogMsg.(*rfc5424.SyslogMessage)
	if !ok {
		t.Fatalf("expected RFC5424 message, got %T", syslogMsg)
	}

	entry := SyslogMessageToLogEntry(rfc5424Msg)
	if entry == nil {
		t.Fatal("expected log entry")
	}

	if err := EnrichLogEntryWithCEF(entry); err != nil {
		t.Fatalf("enrich cef: %v", err)
	}

	if entry.Format != "cef" {
		t.Fatalf("expected cef format, got %q", entry.Format)
	}
	if entry.CEFName != "worm successfully stopped" {
		t.Fatalf("expected cef name, got %q", entry.CEFName)
	}
	if entry.CEFSeverity != "10" {
		t.Fatalf("expected cef severity, got %q", entry.CEFSeverity)
	}
	if entry.ParsedCEFExtensions["src"] != "198.51.100.10" {
		t.Fatalf("expected src extension, got %q", entry.ParsedCEFExtensions["src"])
	}
}

func TestEnrichLogEntryWithCEFFromRFC3164(t *testing.T) {
	entry, err := ParseRFC3164ToLogEntry("<134>Feb  1 11:37:00 edge-bridge mdns: CEF:1|Acme|dns-gateway|2.5|dnsAdBlock|Blocked query|Medium|cat=ADVERTISEMENT request=telemetry.example.invalid src=198.51.100.17 dst=127.0.0.1 proto=udp")
	if err != nil {
		t.Fatalf("parse rfc3164: %v", err)
	}

	if err := EnrichLogEntryWithCEF(entry); err != nil {
		t.Fatalf("enrich cef: %v", err)
	}

	if entry.CEFVersion != "1" {
		t.Fatalf("expected cef version 1, got %q", entry.CEFVersion)
	}
	if entry.CEFDeviceVendor != "Acme" {
		t.Fatalf("expected vendor Acme, got %q", entry.CEFDeviceVendor)
	}
	if entry.ParsedCEFExtensions["request"] != "telemetry.example.invalid" {
		t.Fatalf("expected request extension, got %q", entry.ParsedCEFExtensions["request"])
	}
}

func TestEnrichLogEntryWithCEFFromRFC3164WithoutPriority(t *testing.T) {
	entry, err := ParseRFC3164ToLogEntry(`Mar 25 20:41:15 gateway-node CEF:0|Ubiquiti|UniFi Network|10.2.97|544|Network Accessed|4|src=198.51.100.17 UNIFIcategory=Audit UNIFIhost=Gateway Node`)
	if err != nil {
		t.Fatalf("parse rfc3164 without priority: %v", err)
	}

	if err := EnrichLogEntryWithCEF(entry); err != nil {
		t.Fatalf("enrich cef: %v", err)
	}

	if entry.Format != "cef" {
		t.Fatalf("expected cef format, got %q", entry.Format)
	}
	if entry.CEFDeviceVendor != "Ubiquiti" {
		t.Fatalf("expected vendor Ubiquiti, got %q", entry.CEFDeviceVendor)
	}
	if entry.CEFName != "Network Accessed" {
		t.Fatalf("expected cef name, got %q", entry.CEFName)
	}
	if entry.CEFSeverity != "4" {
		t.Fatalf("expected cef severity, got %q", entry.CEFSeverity)
	}
}

func TestEnrichLogEntryWithCEFDecodesEscapes(t *testing.T) {
	entry := testLogEntry("CEF:0|security|threatmanager|1.0|100|detected a \\| in message|10|src=198.51.100.10 act=blocked a \\= with \\\\ slash msg=Detected a threat.\\n No action needed filePath=/tmp/my file name.txt")

	if err := EnrichLogEntryWithCEF(&entry); err != nil {
		t.Fatalf("enrich cef: %v", err)
	}

	if entry.CEFName != "detected a | in message" {
		t.Fatalf("expected escaped pipe in name, got %q", entry.CEFName)
	}
	if entry.ParsedCEFExtensions["act"] != "blocked a = with \\ slash" {
		t.Fatalf("expected escaped extension value, got %q", entry.ParsedCEFExtensions["act"])
	}
	if entry.ParsedCEFExtensions["msg"] != "Detected a threat.\n No action needed" {
		t.Fatalf("expected newline decoding, got %q", entry.ParsedCEFExtensions["msg"])
	}
	if entry.ParsedCEFExtensions["filePath"] != "/tmp/my file name.txt" {
		t.Fatalf("expected spaces in extension value, got %q", entry.ParsedCEFExtensions["filePath"])
	}
}

func TestEnrichLogEntryWithCEFMalformedFallsBack(t *testing.T) {
	entry := testLogEntry("CEF:0|security|threatmanager|1.0|100|detected a \\| in message|10|src=198.51.100.10")
	entry.Message = "CEF:0|only|two"
	entry.Format = "syslog"

	if err := EnrichLogEntryWithCEF(&entry); err == nil {
		t.Fatal("expected malformed cef error")
	}

	if entry.Format != "syslog" {
		t.Fatalf("expected syslog fallback, got %q", entry.Format)
	}
	if entry.CEFName != "" {
		t.Fatalf("expected no cef fields on fallback, got %q", entry.CEFName)
	}
}

func TestEnrichLogEntryWithCEFNoopForNonCEF(t *testing.T) {
	entry := testLogEntry("plain syslog body")
	entry.Message = "plain syslog body"
	entry.Format = "syslog"

	if err := EnrichLogEntryWithCEF(&entry); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if entry.Format != "syslog" {
		t.Fatalf("expected syslog format, got %q", entry.Format)
	}
}

func testLogEntry(message string) models.LogEntry {
	return models.LogEntry{
		Message: message,
		Format:  "syslog",
	}
}
