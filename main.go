package main

import (
	"embed"
	"flag"
	"log"

	"citadels/internal/server"
)

//go:embed web/static
var static embed.FS

func main() {
	port := flag.Int("port", 8080, "server port")
	flag.Parse()

	srv := server.New(*port, static)
	if err := srv.Start(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
