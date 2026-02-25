package qrcode

import qr "github.com/skip2/go-qrcode"

// Generate creates a QR code PNG image for the given URL.
func Generate(url string) ([]byte, error) {
	return qr.Encode(url, qr.Medium, 256)
}
