package handlers

import (
	"log"
	"net/http"
)

// HealthHandler handles the health check endpoint
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte("Sloggo backend is running")); err != nil {
		log.Printf("Failed to write health response: %v", err)
	}
}
