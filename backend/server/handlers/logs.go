package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sloggo/db"
	"sloggo/models"
	"sloggo/utils"
	"strconv"
	"strings"
	"sync"
	"time"
)

// LogsResponse represents the API response format for logs
type LogsResponse struct {
	Data       []models.LogEntry `json:"data"`
	Meta       InfiniteQueryMeta `json:"meta"`
	NextCursor *int64            `json:"nextCursor"`
	PrevCursor *int64            `json:"prevCursor"`
}

// InfiniteQueryMeta contains metadata for infinite scrolling
type InfiniteQueryMeta struct {
	TotalRowCount  int                         `json:"totalRowCount"`
	FilterRowCount int                         `json:"filterRowCount"`
	ChartData      []db.ChartDataPoint         `json:"chartData"`
	Facets         map[string]db.FacetMetadata `json:"facets"`
	Metadata       map[string]any              `json:"metadata,omitempty"`
}

// LogsHandler handles the API endpoint for logs
func LogsHandler(w http.ResponseWriter, r *http.Request) {
	requestStartTime := time.Now()

	// Set CORS headers for cross-origin requests in development
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	query := r.URL.Query()

	// Pagination parameters
	size := 50

	if sizeStr := query.Get("size"); sizeStr != "" {
		if parsedSize, err := strconv.Atoi(sizeStr); err == nil && parsedSize > 0 {
			size = parsedSize
		}
	}

	// Direction for pagination
	direction := query.Get("direction")
	if direction == "" {
		direction = "next"
	} else if direction != "next" && direction != "prev" {
		direction = "next"
	}

	// Filters
	filters := make(map[string]any)

	// Hostname filter
	if hostname := getStringQueryFilter(query, "hostname"); hostname != nil {
		filters["hostname"] = hostname
	}

	// App name filter
	if appName := getStringQueryFilter(query, "appName"); appName != nil {
		filters["appName"] = appName
	}

	// Process ID filter
	if procID := getStringQueryFilter(query, "procId"); procID != nil {
		filters["procId"] = procID
	}

	// Message ID filter
	if msgID := getStringQueryFilter(query, "msgId"); msgID != nil {
		filters["msgId"] = msgID
	}

	// Message filter
	if message := getStringQueryFilter(query, "message"); message != nil {
		filters["message"] = message
	}

	// Format filter
	if format := getStringQueryFilter(query, "format"); format != nil {
		filters["format"] = format
	}

	if utils.CEFEnabled {
		if cefVersion := getStringQueryFilter(query, "cefVersion"); cefVersion != nil {
			filters["cefVersion"] = cefVersion
		}

		if cefDeviceVendor := getStringQueryFilter(query, "cefDeviceVendor"); cefDeviceVendor != nil {
			filters["cefDeviceVendor"] = cefDeviceVendor
		}

		if cefDeviceProduct := getStringQueryFilter(query, "cefDeviceProduct"); cefDeviceProduct != nil {
			filters["cefDeviceProduct"] = cefDeviceProduct
		}

		if cefDeviceVersion := getStringQueryFilter(query, "cefDeviceVersion"); cefDeviceVersion != nil {
			filters["cefDeviceVersion"] = cefDeviceVersion
		}

		if cefSignatureID := getStringQueryFilter(query, "cefSignatureId"); cefSignatureID != nil {
			filters["cefSignatureId"] = cefSignatureID
		}

		if cefName := getStringQueryFilter(query, "cefName"); cefName != nil {
			filters["cefName"] = cefName
		}

		if cefSeverity := getStringQueryFilter(query, "cefSeverity"); cefSeverity != nil {
			filters["cefSeverity"] = cefSeverity
		}

		if cefExtStr := query.Get("cefExt"); cefExtStr != "" {
			var cefExt map[string]string
			if err := json.Unmarshal([]byte(cefExtStr), &cefExt); err == nil && len(cefExt) > 0 {
				filters["cefExt"] = cefExt
			}
		}
	}

	if msgFieldStr := query.Get("msgField"); msgFieldStr != "" {
		var msgField map[string]string
		if err := json.Unmarshal([]byte(msgFieldStr), &msgField); err == nil && len(msgField) > 0 {
			filters["msgField"] = msgField
		}
	}

	// Facility filter
	if facilityStr := query.Get("facility"); facilityStr != "" {
		facilityValues := strings.Split(facilityStr, ",")
		facilities := make([]int, 0, len(facilityValues))

		for _, v := range facilityValues {
			if facility, err := strconv.Atoi(v); err == nil {
				facilities = append(facilities, facility)
			}
		}

		if len(facilities) > 0 {
			filters["facility"] = facilities
		}
	}

	// Severity filter
	if severityStr := query.Get("severity"); severityStr != "" {
		severityValues := strings.Split(severityStr, ",")
		severities := make([]int, 0, len(severityValues))

		for _, v := range severityValues {
			if severity, err := strconv.Atoi(v); err == nil {
				severities = append(severities, severity)
			}
		}

		if len(severities) > 0 {
			filters["severity"] = severities
		}
	}

	// Parse cursor (timestamp) for pagination
	var cursor time.Time
	now := time.Now().UTC().Add(1 * time.Minute) // Allow for clock skew

	if cursorStr := query.Get("cursor"); cursorStr != "" {
		if parsedCursor, err := strconv.ParseInt(cursorStr, 10, 64); err == nil {
			cursorTime := time.Unix(0, parsedCursor*int64(time.Millisecond))
			if cursorTime.After(now) {
				cursor = now
			} else {
				cursor = cursorTime
			}
		} else {
			// Use current time if parsing fails
			cursor = now
		}
	} else {
		// Default to current time if no cursor provided
		cursor = now
	}

	// Date range filter
	if dateStr := query.Get("timestamp"); dateStr != "" {
		dateValues := strings.Split(dateStr, "-")

		if len(dateValues) == 2 {
			startMillis, startErr := strconv.ParseInt(dateValues[0], 10, 64)
			endMillis, endErr := strconv.ParseInt(dateValues[1], 10, 64)

			if startErr == nil && endErr == nil {
				filters["startDate"] = time.Unix(0, startMillis*int64(time.Millisecond))
				filters["endDate"] = time.Unix(0, endMillis*int64(time.Millisecond))
			}
		}
	}

	// Sort parameter
	sortField := "timestamp"
	sortOrder := "DESC"

	if sortStr := query.Get("sort"); sortStr != "" {
		sortParts := strings.Split(sortStr, ".")

		if len(sortParts) == 2 {
			sortField = sortParts[0]
			if sortParts[1] == "asc" {
				sortOrder = "ASC"
			}
		}
	}

	// Parallelize database calls for better performance
	var wg sync.WaitGroup
	var logs []models.LogEntry
	var totalCount, filterCount int
	var facets map[string]db.FacetMetadata
	var chartData []db.ChartDataPoint
	var cefExtensionKeys []string
	var messageFieldKeys []string
	var logsErr, facetsErr, chartErr, cefKeysErr, msgKeysErr error

	numTasks := 4
	if utils.CEFEnabled {
		numTasks++
	}
	wg.Add(numTasks)

	// Time for all database operations
	queryStartTime := time.Now()

	// Get logs from database
	go func() {
		defer wg.Done()
		logs, totalCount, filterCount, logsErr = db.GetLogs(size, cursor, direction, filters, sortField, sortOrder)

		if utils.Debug {
			log.Printf("⚡ GetLogs execution time: %v", time.Since(queryStartTime))
		}
	}()

	// Get facets for filtering
	go func() {
		defer wg.Done()
		facets, facetsErr = db.GetFacets(filters)

		if utils.Debug {
			log.Printf("⚡ GetFacets execution time: %v", time.Since(queryStartTime))
		}
	}()

	// Get chart data
	go func() {
		defer wg.Done()
		chartData, chartErr = db.GetChartData(cursor, filters)

		if utils.Debug {
			log.Printf("⚡️ GetChartData execution time: %v", time.Since(queryStartTime))
		}
	}()

	if utils.CEFEnabled {
		go func() {
			defer wg.Done()
			cefExtensionKeys, cefKeysErr = db.GetCEFExtensionKeys(filters)

			if utils.Debug {
				log.Printf("⚡️ GetCEFExtensionKeys execution time: %v", time.Since(queryStartTime))
			}
		}()
	}

	go func() {
		defer wg.Done()
		messageFieldKeys, msgKeysErr = db.GetMessageFieldKeys(filters)

		if utils.Debug {
			log.Printf("⚡️ GetMessageFieldKeys execution time: %v", time.Since(queryStartTime))
		}
	}()

	// Wait for all goroutines to complete
	wg.Wait()
	if utils.Debug {
		log.Printf("⚡️ Total database operations execution time: %v", time.Since(queryStartTime))
	}
	// Check for errors
	if logsErr != nil {
		log.Printf("Error fetching logs: %v", logsErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if facetsErr != nil {
		log.Printf("Error fetching facets: %v", facetsErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if chartErr != nil {
		log.Printf("Error fetching chart data: %v", chartErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if cefKeysErr != nil {
		log.Printf("Error fetching CEF extension keys: %v", cefKeysErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if msgKeysErr != nil {
		log.Printf("Error fetching message field keys: %v", msgKeysErr)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Process logs for API response format
	processStartTime := time.Now()
	for i := range logs {
		// Parse structured data JSON if present
		structData := make(map[string]map[string]string)
		cefExtensions := make(map[string]string)
		messageFields := make(map[string]string)

		if logs[i].StructuredData != "" && logs[i].StructuredData != "-" {
			// Attempt to parse the JSON data
			if err := json.Unmarshal([]byte(logs[i].StructuredData), &structData); err != nil {
				log.Printf("Error parsing structured data for row %d", logs[i].RowID)
			}
		}

		logs[i].ParsedStructuredData = structData
		if logs[i].CEFExtensions != "" && logs[i].CEFExtensions != "{}" {
			if err := json.Unmarshal([]byte(logs[i].CEFExtensions), &cefExtensions); err != nil {
				log.Printf("Error parsing CEF extensions for row %d", logs[i].RowID)
			}
		}
		logs[i].ParsedCEFExtensions = cefExtensions
		if logs[i].MessageFields != "" && logs[i].MessageFields != "{}" {
			if err := json.Unmarshal([]byte(logs[i].MessageFields), &messageFields); err != nil {
				log.Printf("Error parsing message fields for row %d", logs[i].RowID)
			}
		} else if extracted := utils.ExtractJSONMessageFields(logs[i].Message); len(extracted) > 0 {
			messageFields = extracted
		}
		logs[i].ParsedMessageFields = messageFields

		// Ensure timestamp is properly formatted for JavaScript to parse
		// This is already handled by Go's JSON marshaller, but making it explicit
		if logs[i].Timestamp.IsZero() {
			logs[i].Timestamp = time.Now()
		}
	}

	if utils.Debug {
		log.Printf("⚡️ Log processing time: %v", time.Since(processStartTime))
	}
	// Determine next and previous cursors
	var nextCursor, prevCursor *int64 = nil, nil
	if len(logs) > 0 {
		nextVal := logs[len(logs)-1].Timestamp.UnixNano() / int64(time.Millisecond)
		prevVal := logs[0].Timestamp.UnixNano() / int64(time.Millisecond)
		nextCursor = &nextVal
		prevCursor = &prevVal
	}

	// Prepare the response
	prepareResponseStartTime := time.Now()
	response := LogsResponse{
		Data: logs,
		Meta: InfiniteQueryMeta{
			TotalRowCount:  totalCount,
			FilterRowCount: filterCount,
			ChartData:      chartData,
			Facets:         facets,
			Metadata: map[string]any{
				"cefEnabled":       utils.CEFEnabled,
				"cefExtensionKeys": cefExtensionKeys,
				"messageFieldKeys": messageFieldKeys,
			},
		},
		NextCursor: nextCursor,
		PrevCursor: prevCursor,
	}

	if utils.Debug {
		log.Printf("⚡️ Response preparation time: %v", time.Since(prepareResponseStartTime))
	}

	// Set content type and encode response
	w.Header().Set("Content-Type", "application/json")

	// Send the response to the client
	encodeStartTime := time.Now()
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if utils.Debug {
		log.Printf("⚡️ JSON encoding time: %v", time.Since(encodeStartTime))
		log.Printf("⚡️ Total request handling time: %v\n\n", time.Since(requestStartTime))
	}
}

func getStringQueryFilter(query map[string][]string, key string) any {
	values, ok := query[key]
	if !ok || len(values) == 0 {
		return nil
	}

	normalizedValues := make([]string, 0, len(values))
	for _, value := range values {
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			continue
		}

		if strings.HasPrefix(trimmedValue, "[") {
			var parsedValues []string
			if err := json.Unmarshal([]byte(trimmedValue), &parsedValues); err == nil {
				for _, parsedValue := range parsedValues {
					trimmedParsedValue := strings.TrimSpace(parsedValue)
					if trimmedParsedValue != "" {
						normalizedValues = append(normalizedValues, trimmedParsedValue)
					}
				}
				continue
			}
		}

		normalizedValues = append(normalizedValues, trimmedValue)
	}

	switch len(normalizedValues) {
	case 0:
		return nil
	case 1:
		return normalizedValues[0]
	default:
		return normalizedValues
	}
}
