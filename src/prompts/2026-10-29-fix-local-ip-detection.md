# Fix local IP detection on Windows and Linux

## Request
Explain why Kerni reported the router's `192.168.1.1` address as this PC's local IP, and propose a fix for Windows and Linux.

## Decisions
- Read `miIpLocal`, matching the camelCase JSON emitted by Rust, instead of the nonexistent `mi_ip_local` property.
- Stop inferring the PC's IP from ARP entries; ARP lists neighbors and may contain only the router.
- Determine the IPv4 source address chosen by the system route on both Windows and Linux using a UDP socket. Connecting the socket selects a route without sending a packet.
- If no local IP can be determined, say so instead of labeling a neighbor as this PC.

## Verification
- Added Rust serialization coverage and front-end regressions for a router-only ARP table and an empty table.
- `cd src/desktop && npm test`
- `cd src/desktop/src-tauri && cargo test`
