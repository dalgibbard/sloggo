package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sloggo/models"
	"sloggo/utils"

	"github.com/marcboeker/go-duckdb/v2"
)

var (
	db                    *sql.DB
	batchLogsMutex        sync.Mutex
	batchLogs             []models.LogEntry
	maxBatchStoreLogsSize = 10000
	cleanupTick           = 30 * time.Minute
)

const logsTableName = "logs"

// ChartDataPoint represents a single point of log data for charts
type ChartDataPoint struct {
	Timestamp int64 `json:"timestamp"`
	Debug     int   `json:"debug"`
	Info      int   `json:"info"`
	Notice    int   `json:"notice"`
	Warning   int   `json:"warning"`
	Error     int   `json:"error"`
	Critical  int   `json:"critical"`
	Alert     int   `json:"alert"`
	Emergency int   `json:"emergency"`
}

// FacetMetadata represents metadata for faceted search
type FacetMetadata struct {
	Rows []FacetRow `json:"rows"`
}

// FacetRow represents a single row in facet metadata
type FacetRow struct {
	Value any `json:"value"`
	Total int `json:"total"`
}

func init() {
	// Set up database connection
	setupDatabase()

	// Initialize schema
	setupDatabaseTable("logs")

	batchLogs = make([]models.LogEntry, 0, maxBatchStoreLogsSize)

	// Start the batch processor
	go processBatchPeriodically()

	// Start the log cleanup process
	go performLogCleanupPeriodically()
}

// setupDatabase initializes the database connections
// Uses in-memory database for tests and file-based for production
func setupDatabase() {
	var err error

	e, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}

	dsn := filepath.Join(filepath.Dir(e), ".duckdb", "logs.db")

	if testing.Testing() {
		dsn = ""
	}

	db, err = sql.Open("duckdb", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
}

// setupDatabaseTable creates a table if it doesn't already exist
func setupDatabaseTable(table string) {
	ctx := context.Background()
	query := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s (
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
		`, table)

	if _, err := db.ExecContext(ctx, query); err != nil {
		log.Fatalf("Failed to create table %s: %v", table, err)
	}

	if err := ensureLogsTableSchema(table); err != nil {
		log.Fatalf("Failed to migrate table %s: %v", table, err)
	}
}

func ensureLogsTableSchema(table string) error {
	ctx := context.Background()
	existingColumns, err := getTableColumns(table)
	if err != nil {
		return err
	}

	type columnSpec struct {
		Name          string
		AddDefinition string
	}

	requiredColumns := []columnSpec{
		{Name: "format", AddDefinition: "TEXT"},
		{Name: "cef_version", AddDefinition: "TEXT"},
		{Name: "cef_device_vendor", AddDefinition: "TEXT"},
		{Name: "cef_device_product", AddDefinition: "TEXT"},
		{Name: "cef_device_version", AddDefinition: "TEXT"},
		{Name: "cef_signature_id", AddDefinition: "TEXT"},
		{Name: "cef_name", AddDefinition: "TEXT"},
		{Name: "cef_severity", AddDefinition: "TEXT"},
		{Name: "cef_extensions", AddDefinition: "TEXT"},
	}

	for _, column := range requiredColumns {
		if slices.Contains(existingColumns, column.Name) {
			continue
		}

		query := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column.Name, column.AddDefinition)
		if _, err := db.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("add column %s: %w", column.Name, err)
		}
	}

	if _, err := db.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET format = 'syslog' WHERE format IS NULL OR format = ''", table)); err != nil {
		return fmt.Errorf("backfill format column: %w", err)
	}

	_, _ = db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ALTER COLUMN format SET DEFAULT 'syslog'", table))
	_, _ = db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ALTER COLUMN format SET NOT NULL", table))

	return nil
}

func getTableColumns(table string) ([]string, error) {
	rows, err := db.QueryContext(context.Background(), fmt.Sprintf("PRAGMA table_info('%s')", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := []string{}
	for rows.Next() {
		var cid any
		var name string
		var columnType any
		var notNull any
		var defaultValue any
		var pk any

		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return nil, err
		}

		columns = append(columns, name)
	}

	return columns, rows.Err()
}

// GetDBInstance returns the initialized DuckDB database instance.
func GetDBInstance() *sql.DB {
	return db
}

func normalizeLogEntry(entry models.LogEntry) models.LogEntry {
	if entry.Format == "" {
		entry.Format = "syslog"
	}
	if entry.StructuredData == "" {
		entry.StructuredData = "-"
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now().UTC()
	}

	return entry
}

// StoreLog adds a log entry to the batch for efficient processing
func StoreLog(entry models.LogEntry) error {
	entry = normalizeLogEntry(entry)

	batchLogsMutex.Lock()
	batchLogs = append(batchLogs, entry)

	// If we've reached the max batch size, process immediately
	if len(batchLogs) >= maxBatchStoreLogsSize {
		// Don't unlock here - let ProcessBatchStoreLogs handle it
		// by calling it while holding the lock
		entries := batchLogs
		batchLogs = make([]models.LogEntry, 0, maxBatchStoreLogsSize)
		batchLogsMutex.Unlock()

		// Process the batch outside the lock
		return processBatchStoreLogsWithEntries(entries)
	}

	batchLogsMutex.Unlock()
	return nil
}

// ProcessBatchStoreLogs processes all pending log entries
// This is called by the periodic batch processor
func ProcessBatchStoreLogs() error {
	batchLogsMutex.Lock()
	if len(batchLogs) == 0 {
		batchLogsMutex.Unlock()
		return nil
	}

	entries := batchLogs
	batchLogs = make([]models.LogEntry, 0, maxBatchStoreLogsSize)
	batchLogsMutex.Unlock()

	return processBatchStoreLogsWithEntries(entries)
}

// processBatchStoreLogsWithEntries processes a batch of log entries
// This function does not touch the global batchLogs slice
func processBatchStoreLogsWithEntries(entries []models.LogEntry) error {
	if len(entries) == 0 {
		return nil
	}

	// Get the underlying DuckDB connection from sql.DB
	dbConn, err := db.Conn(context.Background())
	if err != nil {
		return err
	}
	defer dbConn.Close()

	var rawConn driver.Conn
	err = dbConn.Raw(func(driverConn any) error {
		conn, ok := driverConn.(driver.Conn)
		if !ok {
			return fmt.Errorf("unexpected driver connection type %T", driverConn)
		}
		rawConn = conn
		return nil
	})
	if err != nil {
		return err
	}

	appender, err := duckdb.NewAppenderFromConn(rawConn, "", "logs")
	if err != nil {
		log.Printf("Failed to create appender: %v", err)
		return err
	}
	defer func() {
		if closeErr := appender.Close(); closeErr != nil {
			log.Printf("Error closing appender: %v", closeErr)
		}
	}()

	// Append each log entry directly from struct fields
	for i := range entries {
		entry := &entries[i]
		if err := appender.AppendRow(
			entry.Severity,
			entry.Facility,
			entry.Version,
			entry.Timestamp,
			entry.Hostname,
			entry.AppName,
			entry.ProcID,
			entry.MsgID,
			entry.StructuredData,
			entry.Message,
			entry.Format,
			entry.CEFVersion,
			entry.CEFDeviceVendor,
			entry.CEFDeviceProduct,
			entry.CEFDeviceVersion,
			entry.CEFSignatureID,
			entry.CEFName,
			entry.CEFSeverity,
			entry.CEFExtensions,
		); err != nil {
			log.Printf("Failed to append row %d: %v", i+1, err)
			return err
		}
	}

	// Flush the appender to ensure data is written
	if err := appender.Flush(); err != nil {
		log.Printf("Failed to flush appender: %v", err)
		return err
	}
	return nil
}

// processBatchPeriodically processes any pending logs on a timer
func processBatchPeriodically() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if err := ProcessBatchStoreLogs(); err != nil {
			log.Printf("Error in periodic batch processing: %v", err)
		}
	}
}

// cleanupOldLogs deletes logs older than the retention period
func cleanupOldLogs() error {
	ctx := context.Background()
	// Calculate the cutoff timestamp for deletion (current time - retention period)
	cutoffTime := time.Now().Add(-time.Duration(utils.LogRetentionMinutes) * time.Minute).UTC().Format(time.RFC3339Nano)

	query := "DELETE FROM logs WHERE timestamp < ?"

	result, err := db.ExecContext(ctx, query, cutoffTime)
	if err != nil {
		log.Printf("Failed to delete old logs: %v", err)
		return err
	}

	// Log the number of deleted rows
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Failed to get rows affected by cleanup: %v", err)
	} else if rowsAffected > 0 {
		log.Printf("Cleaned up %d log entries older than %s", rowsAffected, cutoffTime)
	}

	return nil
}

// performLogCleanupPeriodically runs log cleanup on a timer
func performLogCleanupPeriodically() {
	ticker := time.NewTicker(cleanupTick)
	defer ticker.Stop()

	for range ticker.C {
		if err := cleanupOldLogs(); err != nil {
			log.Printf("Error in periodic log cleanup: %v", err)
		}
	}
}

// GetLogs retrieves logs from the database based on filters
func GetLogs(limit int, cursor time.Time, direction string, filters map[string]any, sortField string, sortOrder string) (entries []models.LogEntry, totalCount int, filterCount int, err error) {
	ctx := context.Background()
	// Build query
	queryBuilder := strings.Builder{}
	countQueryBuilder := strings.Builder{}
	filterQueryBuilder := strings.Builder{}
	args := []any{}

	queryBuilder.WriteString("SELECT rowid, facility, severity, version, timestamp, hostname, app_name, procid, msgid, structured_data, msg, format, cef_version, cef_device_vendor, cef_device_product, cef_device_version, cef_signature_id, cef_name, cef_severity, cef_extensions FROM logs ")
	countQueryBuilder.WriteString("SELECT COUNT(*) FROM logs ")

	whereClause := buildWhereClause(filters, cursor, direction, &args)
	if whereClause != "" {
		filterQueryBuilder.WriteString("WHERE ")
		filterQueryBuilder.WriteString(whereClause)
	}

	queryBuilder.WriteString(filterQueryBuilder.String())
	countQueryBuilder.WriteString(filterQueryBuilder.String())

	if sanitizedSortField := sanitizeSortField(sortField); sanitizedSortField != "" && sortOrder != "" {
		queryBuilder.WriteString(fmt.Sprintf(" ORDER BY %s %s", sanitizedSortField, sortOrder))
	} else {
		queryBuilder.WriteString(" ORDER BY timestamp DESC")
	}

	queryBuilder.WriteString(fmt.Sprintf(" LIMIT %d", limit))

	rows, err := db.QueryContext(ctx, queryBuilder.String(), args...)
	if err != nil {
		return nil, 0, 0, fmt.Errorf("error querying logs: %w", err)
	}
	defer rows.Close()

	if err = db.QueryRowContext(ctx, countQueryBuilder.String(), args...).Scan(&filterCount); err != nil {
		return nil, 0, 0, fmt.Errorf("error counting filtered logs: %w", err)
	}
	if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM logs").Scan(&totalCount); err != nil {
		return nil, 0, 0, fmt.Errorf("error counting total logs: %w", err)
	}

	// Parse results
	entries = make([]models.LogEntry, 0, limit)
	for rows.Next() {
		var entry models.LogEntry
		var timestampStr string

		err := rows.Scan(
			&entry.RowID,
			&entry.Facility,
			&entry.Severity,
			&entry.Version,
			&timestampStr,
			&entry.Hostname,
			&entry.AppName,
			&entry.ProcID,
			&entry.MsgID,
			&entry.StructuredData,
			&entry.Message,
			&entry.Format,
			&entry.CEFVersion,
			&entry.CEFDeviceVendor,
			&entry.CEFDeviceProduct,
			&entry.CEFDeviceVersion,
			&entry.CEFSignatureID,
			&entry.CEFName,
			&entry.CEFSeverity,
			&entry.CEFExtensions,
		)
		if err != nil {
			return nil, 0, 0, fmt.Errorf("error scanning log row: %w", err)
		}

		// Parse timestamp
		entry.Timestamp, err = time.Parse(time.RFC3339Nano, timestampStr)
		if err != nil {
			return nil, 0, 0, fmt.Errorf("error parsing timestamp: %w", err)
		}

		if entry.Format == "" {
			entry.Format = "syslog"
		}

		entries = append(entries, entry)
	}

	return entries, totalCount, filterCount, rows.Err()
}

// GetFacets retrieves facet metadata for filtering
func GetFacets(filters map[string]any) (map[string]FacetMetadata, error) {
	ctx := context.Background()
	// For facets, exclude temporal filters (date range) to show total state
	// This ensures live mode facets represent all logs, not just new ones
	facetFilters := make(map[string]any)
	for k, v := range filters {
		if k != "startDate" && k != "endDate" {
			facetFilters[k] = v
		}
	}

	facets := make(map[string]FacetMetadata)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var globalErr error

	// Fast direct queries in parallel
	wg.Add(2)

	// Get severity facets concurrently with highly optimized query
	go func() {
		defer wg.Done()

		query := "SELECT severity as value, COUNT(*) as total FROM logs"
		args := []any{}

		whereClause := buildWhereClause(facetFilters, time.Time{}, "", &args)
		if whereClause != "" {
			query += " WHERE " + whereClause
		}

		query += " GROUP BY severity"

		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			mu.Lock()
			globalErr = fmt.Errorf("error querying severity facets: %w", err)
			mu.Unlock()
			return
		}
		defer rows.Close()

		facetRows := []FacetRow{}
		for rows.Next() {
			var row FacetRow
			var valueStr string
			err := rows.Scan(&valueStr, &row.Total)
			if err != nil {
				mu.Lock()
				globalErr = fmt.Errorf("error scanning severity facet row: %w", err)
				mu.Unlock()
				return
			}

			// Try to convert to integer if possible
			if intVal, err := strconv.Atoi(valueStr); err == nil {
				row.Value = intVal
			} else {
				row.Value = valueStr
			}

			facetRows = append(facetRows, row)
		}

		mu.Lock()
		facets["severity"] = FacetMetadata{
			Rows: facetRows,
		}
		mu.Unlock()
	}()

	// Get facility facets concurrently
	go func() {
		defer wg.Done()

		query := "SELECT facility as value, COUNT(*) as total FROM logs"
		args := []any{}

		whereClause := buildWhereClause(facetFilters, time.Time{}, "", &args)
		if whereClause != "" {
			query += " WHERE " + whereClause
		}

		query += " GROUP BY facility"

		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			mu.Lock()
			globalErr = fmt.Errorf("error querying facility facets: %w", err)
			mu.Unlock()
			return
		}
		defer rows.Close()

		facetRows := []FacetRow{}
		for rows.Next() {
			var row FacetRow
			var valueStr string
			err := rows.Scan(&valueStr, &row.Total)
			if err != nil {
				mu.Lock()
				globalErr = fmt.Errorf("error scanning facility facet row: %w", err)
				mu.Unlock()
				return
			}

			// Try to convert to integer if possible
			if intVal, err := strconv.Atoi(valueStr); err == nil {
				row.Value = intVal
			} else {
				row.Value = valueStr
			}

			facetRows = append(facetRows, row)
		}

		mu.Lock()
		facets["facility"] = FacetMetadata{
			Rows: facetRows,
		}
		mu.Unlock()
	}()

	// Wait for all goroutines to complete
	wg.Wait()

	// Check if any errors occurred
	if globalErr != nil {
		return nil, globalErr
	}

	return facets, nil
}

// GetChartData retrieves time-series data for charts
func GetChartData(cursor time.Time, filters map[string]any) ([]ChartDataPoint, error) {
	ctx := context.Background()
	chartFilters := make(map[string]any)
	for k, v := range filters {
		chartFilters[k] = v
	}

	// If date filters are not provided, we use the cursor set to the next hour as the end
	// time for chart data and go back 24 hours to get the last 24 hours of data.
	if chartFilters["startDate"] == nil || chartFilters["endDate"] == nil {
		endDate := cursor.Truncate(time.Hour).Add(time.Hour)
		startDate := cursor.Add(-24 * time.Hour)
		chartFilters["endDate"] = endDate
		chartFilters["startDate"] = startDate
	}

	startDate, ok := getTimeFilter(chartFilters["startDate"])
	if !ok {
		startDate = cursor.Add(-24 * time.Hour)
		chartFilters["startDate"] = startDate
	}
	endDate, ok := getTimeFilter(chartFilters["endDate"])
	if !ok {
		endDate = cursor.Truncate(time.Hour).Add(time.Hour)
		chartFilters["endDate"] = endDate
	}
	duration := endDate.Sub(startDate)

	var truncateUnit string

	switch {
	case duration <= 3*24*time.Hour: // Up to 3 days: group by hour (max 72 points)
		truncateUnit = "hour"
	case duration <= 21*24*time.Hour: // Up to 3 weeks: group by day (max 21 points)
		truncateUnit = "day"
	case duration <= 180*24*time.Hour: // Up to ~6 months: group by week (max 26 points)
		truncateUnit = "week"
	default: // More than 6 months: group by month
		truncateUnit = "month"
	}

	// Build query for chart data
	queryBuilder := strings.Builder{}
	args := []any{}

	queryBuilder.WriteString(fmt.Sprintf(`
		SELECT
		    CAST(epoch(date_trunc('%s', timestamp)) * 1000 AS BIGINT) AS ts,
			SUM(CASE WHEN severity = 7 THEN 1 ELSE 0 END) as debug,
			SUM(CASE WHEN severity = 6 THEN 1 ELSE 0 END) as info,
			SUM(CASE WHEN severity = 5 THEN 1 ELSE 0 END) as notice,
			SUM(CASE WHEN severity = 4 THEN 1 ELSE 0 END) as warning,
			SUM(CASE WHEN severity = 3 THEN 1 ELSE 0 END) as error,
			SUM(CASE WHEN severity = 2 THEN 1 ELSE 0 END) as critical,
			SUM(CASE WHEN severity = 1 THEN 1 ELSE 0 END) as alert,
			SUM(CASE WHEN severity = 0 THEN 1 ELSE 0 END) as emergency
		FROM logs
	`, truncateUnit))

	// Add WHERE clause for filtering (excluding temporal constraints)
	whereClause := buildWhereClause(chartFilters, time.Time{}, "", &args)
	if whereClause != "" {
		queryBuilder.WriteString(" WHERE ")
		queryBuilder.WriteString(whereClause)
	}

	// Group by hour
	queryBuilder.WriteString(fmt.Sprintf(" GROUP BY date_trunc('%s', timestamp) ORDER BY ts ASC", truncateUnit))

	// Execute query
	rows, err := db.QueryContext(ctx, queryBuilder.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("error querying chart data: %w", err)
	}
	defer rows.Close()

	// Parse results
	chartData := []ChartDataPoint{}
	for rows.Next() {
		var point ChartDataPoint
		err := rows.Scan(
			&point.Timestamp,
			&point.Debug,
			&point.Info,
			&point.Notice,
			&point.Warning,
			&point.Error,
			&point.Critical,
			&point.Alert,
			&point.Emergency,
		)
		if err != nil {
			return nil, fmt.Errorf("error scanning chart data row: %w", err)
		}

		chartData = append(chartData, point)
	}

	return chartData, nil
}

func GetCEFExtensionKeys(filters map[string]any) ([]string, error) {
	ctx := context.Background()
	queryBuilder := strings.Builder{}
	queryBuilder.WriteString(`
		SELECT DISTINCT ext.key
		FROM logs, json_each(COALESCE(NULLIF(cef_extensions, ''), '{}')) AS ext
	`)

	args := []any{}
	whereClause := buildWhereClause(filters, time.Time{}, "", &args)
	conditions := []string{"format = 'cef'"}
	if whereClause != "" {
		conditions = append(conditions, whereClause)
	}

	queryBuilder.WriteString(" WHERE ")
	queryBuilder.WriteString(strings.Join(conditions, " AND "))
	queryBuilder.WriteString(" ORDER BY ext.key ASC")

	rows, err := db.QueryContext(ctx, queryBuilder.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("error querying cef extension keys: %w", err)
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, fmt.Errorf("error scanning cef extension key: %w", err)
		}
		keys = append(keys, key)
	}

	return keys, rows.Err()
}

func sanitizeSortField(sortField string) string {
	switch sortField {
	case "timestamp":
		return "timestamp"
	case "severity":
		return "severity"
	case "facility":
		return "facility"
	case "hostname":
		return "hostname"
	case "appName":
		return "app_name"
	case "procId":
		return "procid"
	case "msgId":
		return "msgid"
	case "message":
		return "msg"
	case "format":
		return "format"
	case "cefVersion":
		return "cef_version"
	case "cefDeviceVendor":
		return "cef_device_vendor"
	case "cefDeviceProduct":
		return "cef_device_product"
	case "cefDeviceVersion":
		return "cef_device_version"
	case "cefSignatureId":
		return "cef_signature_id"
	case "cefName":
		return "cef_name"
	case "cefSeverity":
		return "cef_severity"
	default:
		return ""
	}
}

// Helper function to build WHERE clause from filters
func buildWhereClause(filters map[string]any, cursor time.Time, direction string, args *[]any) string {
	if len(filters) == 0 && cursor.IsZero() {
		return ""
	}

	conditions := make([]string, 0, len(filters)+1)

	// Add filter conditions
	for key, value := range filters {
		switch key {
		case "severity":
			severities, ok := getIntSliceFilter(value)
			if !ok {
				continue
			}
			if len(severities) > 0 {
				placeholders := make([]string, len(severities))
				for i, s := range severities {
					placeholders[i] = "?"
					*args = append(*args, s)
				}
				conditions = append(conditions, fmt.Sprintf("severity IN (%s)", strings.Join(placeholders, ",")))
			}
		case "facility":
			facilities, ok := getIntSliceFilter(value)
			if !ok {
				continue
			}

			if len(facilities) > 0 {
				placeholders := make([]string, len(facilities))
				for i, f := range facilities {
					placeholders[i] = "?"
					*args = append(*args, f)
				}
				conditions = append(conditions, fmt.Sprintf("facility IN (%s)", strings.Join(placeholders, ",")))
			}
		case "hostname":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "hostname = ?")
			*args = append(*args, filterValue)
		case "procId":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "procid = ?")
			*args = append(*args, filterValue)
		case "appName":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "app_name = ?")
			*args = append(*args, filterValue)
		case "msgId":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "msgid = ?")
			*args = append(*args, filterValue)
		case "format":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "format = ?")
			*args = append(*args, filterValue)
		case "cefVersion":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_version = ?")
			*args = append(*args, filterValue)
		case "cefDeviceVendor":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_device_vendor = ?")
			*args = append(*args, filterValue)
		case "cefDeviceProduct":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_device_product = ?")
			*args = append(*args, filterValue)
		case "cefDeviceVersion":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_device_version = ?")
			*args = append(*args, filterValue)
		case "cefSignatureId":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_signature_id = ?")
			*args = append(*args, filterValue)
		case "cefName":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_name = ?")
			*args = append(*args, filterValue)
		case "cefSeverity":
			filterValue, ok := getStringFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "cef_severity = ?")
			*args = append(*args, filterValue)
		case "cefExt":
			extensionFilters, ok := getCEFExtensionFilters(value)
			if !ok {
				continue
			}
			for key, extValue := range extensionFilters {
				conditions = append(conditions, "json_extract_string(COALESCE(NULLIF(cef_extensions, ''), '{}'), ?) = ?")
				*args = append(*args, buildCEFJSONPath(key), extValue)
			}
		case "startDate":
			filterValue, ok := getTimeFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "timestamp >= ?")
			*args = append(*args, filterValue.Format(time.RFC3339Nano))
		case "endDate":
			filterValue, ok := getTimeFilter(value)
			if !ok {
				continue
			}
			conditions = append(conditions, "timestamp <= ?")
			*args = append(*args, filterValue.Format(time.RFC3339Nano))
		}
	}

	if !cursor.IsZero() {
		if direction == "prev" {
			conditions = append(conditions, "timestamp > ?")
		} else {
			conditions = append(conditions, "timestamp < ?")
		}
		*args = append(*args, cursor.Format(time.RFC3339Nano))
	}

	return strings.Join(conditions, " AND ")
}

func buildCEFJSONPath(key string) string {
	key = strings.ReplaceAll(key, `\`, `\\`)
	key = strings.ReplaceAll(key, `"`, `\"`)
	return fmt.Sprintf(`$.%q`, key)
}

func getStringFilter(value any) (string, bool) {
	filterValue, ok := value.(string)
	return filterValue, ok
}

func getIntSliceFilter(value any) ([]int, bool) {
	filterValue, ok := value.([]int)
	return filterValue, ok
}

func getTimeFilter(value any) (time.Time, bool) {
	filterValue, ok := value.(time.Time)
	return filterValue, ok
}

func getCEFExtensionFilters(value any) (map[string]string, bool) {
	filterValue, ok := value.(map[string]string)
	return filterValue, ok
}
