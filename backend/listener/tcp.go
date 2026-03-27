package listener

import (
	"bufio"
	"context"
	"errors"
	"log"
	"net"
	"sloggo/db"
	"sloggo/formats"
	"sloggo/utils"
	"strings"
	"sync"
	"time"

	"github.com/leodido/go-syslog/v4"
	"github.com/leodido/go-syslog/v4/rfc5424"
)

var (
	rfc5424Parser syslog.Machine
	parserOnce    sync.Once
)

func getRFC5424Parser() syslog.Machine {
	parserOnce.Do(func() {
		rfc5424Parser = rfc5424.NewParser(rfc5424.WithBestEffort())
	})
	return rfc5424Parser
}

func StartTCPListener() {
	port := utils.TCPPort

	_, err := net.DefaultResolver.LookupPort(context.Background(), "tcp", port)
	if err != nil {
		log.Fatalf("Invalid TCP port %s: %v", port, err)
	}

	listener, err := (&net.ListenConfig{}).Listen(context.Background(), "tcp", ":"+port)
	if err != nil {
		log.Fatalf("Failed to start TCP listener on port %s: %v", port, err)
	}
	defer listener.Close()

	log.Printf("TCP listener is running on port :%s", port)

	// Use a semaphore to limit concurrent processors
	maxConcurrentProcessors := 100
	semaphore := make(chan struct{}, maxConcurrentProcessors)

	// Create a WaitGroup to track active connections
	var wg sync.WaitGroup

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Error accepting TCP connection: %v", err)
			continue
		}

		select {
		case semaphore <- struct{}{}:
			// Slot acquired, process the connection
			wg.Add(1)

			go func(c net.Conn) {
				defer func() {
					// Release resources when done
					<-semaphore
					wg.Done()
				}()
				handleTCPConnection(c)
			}(conn)
		default:
			log.Printf("Warning: TCP connection processing at capacity, rejecting connection")
			conn.Close()
		}
	}
}

// handleTCPConnection handles a TCP connection
func handleTCPConnection(conn net.Conn) {
	defer conn.Close()

	scanner := bufio.NewScanner(conn)

	// Configure scanner with a larger buffer for bigger messages
	const maxScanSize = 1024 * 1024 // 1MB max message size
	buffer := make([]byte, 0, 64*1024)
	scanner.Buffer(buffer, maxScanSize)

	if err := conn.SetReadDeadline(time.Now().Add(30 * time.Second)); err != nil {
		log.Printf("Failed to set TCP read deadline: %v", err)
		return
	}

	for {
		// Scan for the next message
		if !scanner.Scan() {
			// Check for errors
			if err := scanner.Err(); err != nil {
				var netErr net.Error
				if errors.As(err, &netErr) && netErr.Timeout() {
					// Just a timeout, reset deadline and try again
					if deadlineErr := conn.SetReadDeadline(time.Now().Add(30 * time.Second)); deadlineErr != nil {
						log.Printf("Failed to reset TCP read deadline: %v", deadlineErr)
						return
					}
					continue
				}
				log.Printf("TCP connection closed: %v", err)
			}
			// EOF or error occurred
			return
		}

		// Reset deadline after successful read
		if err := conn.SetReadDeadline(time.Now().Add(30 * time.Second)); err != nil {
			log.Printf("Failed to refresh TCP read deadline: %v", err)
			return
		}

		message := strings.TrimSpace(scanner.Text())
		if message == "" {
			// Skip empty messages
			continue
		}

		parsed := false
		var lastErr error

		logFormat := utils.GetLogFormat()

		// Try RFC5424 if enabled
		if logFormat == "rfc5424" || logFormat == "auto" {
			parser := getRFC5424Parser()
			if syslogMsg, err := parser.Parse([]byte(message)); err == nil {
				if rfc5424Msg, ok := syslogMsg.(*rfc5424.SyslogMessage); ok {
					logEntry := formats.SyslogMessageToLogEntry(rfc5424Msg)
					if logEntry != nil {
						if err := formats.EnrichLogEntryWithCEF(logEntry); err != nil {
							log.Printf("Failed to parse CEF payload, storing as syslog: %v", err)
						}
						if err := db.StoreLog(*logEntry); err != nil {
							log.Printf("Error storing log: %v", err)
						}
						parsed = true
					}
				}
			} else {
				lastErr = err
			}
		}

		// Try RFC3164 if enabled and not yet parsed
		if !parsed && (logFormat == "rfc3164" || logFormat == "auto") {
			if logEntry, err := formats.ParseRFC3164ToLogEntry(message); err == nil {
				if err := formats.EnrichLogEntryWithCEF(logEntry); err != nil {
					log.Printf("Failed to parse CEF payload, storing as syslog: %v", err)
				}
				if err := db.StoreLog(*logEntry); err != nil {
					log.Printf("Error storing log: %v", err)
				}
				parsed = true
			} else {
				lastErr = err
			}
		}

		if !parsed {
			log.Printf("Failed to parse message with format %s: %v: %s", logFormat, lastErr, message)
		}
	}
}
