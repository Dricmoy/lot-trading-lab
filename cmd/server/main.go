package main

import (
	"log"
	handler "lot/api"
	"net/http"
	"time"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/engine", handler.Handler)
	server := &http.Server{Addr: "127.0.0.1:8001", Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Println("Go engine on http://127.0.0.1:8001")
	log.Fatal(server.ListenAndServe())
}
