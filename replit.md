# Snapmaker Control

## Overview

A web-based dashboard application for monitoring and controlling Snapmaker 2.0 F350 3D printers. The application provides real-time printer status monitoring, temperature tracking, jog controls, file management, and webcam feed viewing. Built as a full-stack TypeScript application with React frontend and Express backend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state management with automatic refetching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom industrial dark theme
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API endpoints under `/api` prefix
- **Development**: Hot module replacement via Vite middleware integration

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains table definitions for printers and print jobs
- **Migrations**: Drizzle Kit for schema migrations (`drizzle-kit push`)

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` directory are shared between frontend and backend
- **Storage Abstraction**: `IStorage` interface in `server/storage.ts` abstracts database operations
- **Path Aliases**: `@/` maps to client source, `@shared/` maps to shared code

### Project Structure
```
client/           # React frontend application
  src/
    components/   # UI components (Dashboard widgets, shadcn/ui)
    pages/        # Route page components
    hooks/        # Custom React hooks
    lib/          # Utilities and query client
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route definitions
  storage.ts      # Database access layer
  db.ts           # Database connection
shared/           # Shared code between frontend/backend
  schema.ts       # Drizzle schema definitions
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Snapmaker Printer Integration
- Direct HTTP communication with Snapmaker printers on port 8080
- Endpoints for status polling, connection management, and control commands
- Token-based authentication for printer connections
- **Background connection service**: Server-side service (`server/backgroundService.ts`) maintains persistent printer monitoring
  - Polls printer status every 5 seconds when connected, 15 seconds when disconnected
  - Automatically detects when printer comes online and attempts reconnection using saved token
  - Tracks print state transitions (idle → running → completed) for statistics
- **Auto-connect feature**: Per-printer setting (autoConnect field) controls whether automatic reconnection attempts are made
- **Statistics tracking**: Tracks total print time, print count, and filament usage across all prints. Stats update automatically when prints complete.
  - Print time and count: Tracked for all prints (detected via background service monitoring)
  - Filament usage: Tracked only for prints using files uploaded through this app (parsed from G-code headers)
- **File tracking workaround**: Snapmaker API doesn't support file listing. Users manually add filenames to track files uploaded via Luban. Files are stored in the `uploadedFiles` database table.
- **Multiple file upload methods**:
  - Manual upload via file picker in FileList component
  - Drag & drop anywhere on the dashboard (global drop zone with overlay)
  - Slicer integration: OctoPrint-compatible endpoints at `/api/files/local` and `/api/upload` for Cura, PrusaSlicer, etc.
  - Watch folder: Configure a local folder path in Settings; new G-code files are auto-imported (uses `server/fileWatcher.ts`)
  - Luban auto-capture: Proxy server intercepts Luban uploads, captures files automatically, and forwards to printer (uses `server/lubanProxy.ts`)
- **Luban token capture**: When Luban connects through the proxy, the app captures and saves Luban's authentication token. This token is then used for prompt-free connections - no touchscreen confirmation needed after the first Luban connection.
- Customizable dashboard: Users can toggle modules (status, webcam, temperature, stats, jog controls, job controls, file list) on/off via the customize panel
- **Push notifications**: Web Push API integration for alerts when app is closed
  - Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL environment variables
  - Notifications sent for: print completed, printer disconnected, printer back online
  - Uses `server/pushService.ts` for sending notifications and `push_subscriptions` database table
  - Service worker handles push events in `client/public/sw.js`
  - iOS PWA requirements: iOS 16.4+, HTTPS, app installed to home screen, user permission granted
- **IP Camera integration**: Connect any IP camera for live print monitoring with three streaming modes:
  - **Snapshot polling** (primary, default for Lorex/Dahua): Fetches JPEG snapshots at configurable intervals via `/cgi-bin/snapshot.cgi` with Digest Auth. Most reliable method for Lorex cameras.
  - **MJPEG live stream**: Uses camera's built-in MJPEG stream. No ffmpeg needed. Server proxies the stream with auth handling. Works well for Axis, Hikvision, and cameras that support it.
  - **RTSP/HLS streaming** (optional): Converts RTSP to HLS via ffmpeg for browsers. Higher quality but more CPU-intensive.
  - **Auto-test on connect**: When connecting a camera, the app tests snapshot and MJPEG URLs before saving and auto-selects the best working mode. Shows detailed error messages if connection fails.
  - Auto-detect feature: Enter just the camera's IP address and the app tries common URL patterns for Lorex, Hikvision, Dahua, ONVIF, Reolink, Axis, Amcrest, and generic cameras
  - Supports HTTP Basic and Digest Auth (Lorex/Dahua cameras use Digest) with automatic detection and caching
  - Auth method is cached per camera host to avoid double requests on every frame
  - Configurable refresh rate (default 1000ms = 1 fps)
  - Full 4K resolution display with fullscreen mode
  - Server-side proxy prevents CORS issues and adds security (LAN-only URLs allowed, strict IP validation)
  - Camera settings stored in appSettings table (camera_url, camera_username, camera_password, camera_refresh_rate)
  - Manual URL entry available in "Advanced options" if auto-detect fails
  - Lorex cameras are Dahua OEM: primary protocol is RTSP on port 554, HTTP snapshots via `/cgi-bin/snapshot.cgi`, Digest Auth required. MJPEG over HTTP not reliably supported.

### UI Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Recharts**: Temperature history charting
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component support

### Build & Development
- **Vite**: Frontend bundler with HMR
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development

## Raspberry Pi Deployment

### Initial Setup
```bash
# Clone the repository
git clone <repo-url> ~/Snapmaker_App
cd ~/Snapmaker_App

# Install dependencies
npm install

# Build the production version
npm run build
```

### PostgreSQL Setup
```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql -c "CREATE USER snapmaker WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE snapmaker OWNER snapmaker;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE snapmaker TO snapmaker;"
```

### HTTPS Setup (Required for Safari/iOS)
```bash
# Generate self-signed SSL certificates (auto-detects Pi's IP)
npm run generate-certs

# Or specify a custom IP address:
bash script/generate-certs.sh 192.168.1.100

# This creates:
#   certs/server.key
#   certs/server.crt
```

Note: With self-signed certificates, browsers will show a security warning on first visit. Click "Advanced" → "Proceed" to trust it.

#### iOS/iPhone Certificate Installation
When HTTPS is enabled, the app runs a separate HTTP server on port 5001 specifically for certificate download (since iOS won't connect to HTTPS without trusting the cert first).

1. On your iPhone, open Safari and go to: `http://YOUR_PI_IP:5001`
2. Tap "Download Certificate"
3. Go to Settings → "Profile Downloaded" → Install
4. Go to Settings → General → About → Certificate Trust Settings → Toggle ON
5. Now access the main app at: `https://YOUR_PI_IP:5000`

If your Pi's IP address changes, regenerate certificates:
```bash
rm -rf certs/
npm run generate-certs
```

### Push Notifications Setup (iOS/Safari)
Push notifications require VAPID keys. Generate your own keys:
```bash
npx web-push generate-vapid-keys
```

Then edit the systemd service file to add your keys:
```bash
sudo nano /etc/systemd/system/snapmaker.service
```

Add these lines in the `[Service]` section (replace with your actual keys):
```
Environment=VAPID_PUBLIC_KEY=your_public_key_here
Environment=VAPID_PRIVATE_KEY=your_private_key_here
Environment=VAPID_EMAIL=mailto:your-email@example.com
```

Or if running manually:
```bash
export VAPID_PUBLIC_KEY="your_public_key_here"
export VAPID_PRIVATE_KEY="your_private_key_here"
export VAPID_EMAIL="mailto:your-email@example.com"
```

After updating the service file:
```bash
sudo systemctl daemon-reload
sudo systemctl restart snapmaker
```

**iOS PWA Requirements for Push:**
- iOS 16.4 or later
- HTTPS enabled (certificates installed)
- App added to Home Screen (not just browser bookmark)
- User must grant notification permission when prompted

### Running the Application
```bash
# Set environment variables
export DATABASE_URL="postgresql://snapmaker:yourpassword@localhost:5432/snapmaker"

# Start the server
npm run start
```

### Access the Dashboard
After starting the app, find your Pi's IP address:
```bash
hostname -I
```

Then access the dashboard at:
- HTTPS: https://YOUR_PI_IP:5000 (if certs generated)
- HTTP: http://YOUR_PI_IP:5000 (if no certs)

### Updating to Latest Version
```bash
cd ~/Snapmaker_App
git pull origin main
npm install
npm run build
# Restart the app (or restart the service if using auto-start)
sudo systemctl restart snapmaker
```

### Auto-Start on Boot
To make the app start automatically when your Pi boots (useful for power loss recovery):

```bash
cd ~/Snapmaker_App

# Make scripts executable
chmod +x scripts/install-service.sh
chmod +x scripts/uninstall-service.sh

# Install the service
./scripts/install-service.sh
```

**Useful service commands:**
```bash
# Check if app is running
sudo systemctl status snapmaker

# View live logs
sudo journalctl -u snapmaker -f

# Restart the app
sudo systemctl restart snapmaker

# Stop the app
sudo systemctl stop snapmaker

# Disable auto-start
sudo systemctl disable snapmaker
```

### Scheduled Nightly Reboot
To reboot your Pi every night at midnight for a fresh start:

```bash
# Edit crontab
sudo crontab -e

# Add this line at the bottom:
0 0 * * * /sbin/reboot
```

This reboots the Pi at midnight, and the app will auto-start thanks to the systemd service.

### WiFi Auto-Reconnect
To ensure your Pi always stays connected to WiFi (auto-reconnects if connection drops):

```bash
cd ~/Snapmaker_App

# Make script executable
chmod +x scripts/install-wifi-reconnect.sh

# Install WiFi auto-reconnect
./scripts/install-wifi-reconnect.sh
```

This does two things:
1. Checks WiFi every 5 minutes and reconnects if lost
2. Disables WiFi power management (prevents random disconnections)

View reconnection logs: `sudo cat /var/log/wifi-reconnect.log`