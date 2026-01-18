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
- Auto-reconnect feature: Background poller continuously monitors printer availability. When a disconnected printer becomes reachable, automatically attempts reconnection using saved token - works even when app is closed
- **File tracking workaround**: Snapmaker API doesn't support file listing. Users manually add filenames to track files uploaded via Luban. Files are stored in the `uploadedFiles` database table.
- **Multiple file upload methods**:
  - Manual upload via file picker in FileList component
  - Drag & drop anywhere on the dashboard (global drop zone with overlay)
  - Slicer integration: OctoPrint-compatible endpoints at `/api/files/local` and `/api/upload` for Cura, PrusaSlicer, etc.
  - Watch folder: Configure a local folder path in Settings; new G-code files are auto-imported (uses `server/fileWatcher.ts`)
  - Luban auto-capture: Proxy server intercepts Luban uploads, captures files automatically, and forwards to printer (uses `server/lubanProxy.ts`)
- **Luban token capture**: When Luban connects through the proxy, the app captures and saves Luban's authentication token. This token is then used for prompt-free connections - no touchscreen confirmation needed after the first Luban connection.
- Customizable dashboard: Users can toggle modules (status, webcam, temperature, jog controls, job controls, file list, stats) on/off via the customize panel
- **Background polling**: Server-side polling service runs every 5 seconds to monitor connected printers (see `server/backgroundPoller.ts`)
- **Real-time timer display**: Frontend uses client-side interpolation to update elapsed/remaining time every 500ms for smooth countdown display
- **Print stats tracking**: Automatically detects print start/end events and records completed prints to database with duration and filename
- **Stats dashboard**: View print statistics by period (Today/Week/Month/All Time) with total print time, print count, and recent print history
- **Browser notifications**: Get real-time notifications when prints start or complete (uses SSE for active tabs)
- **Web Push notifications**: Background push notifications that work even when the app is closed or phone is locked. Requires installing the PWA to home screen (iOS 16.4+). Uses VAPID keys stored in database.
- **File list sorting**: Uploaded files are sorted with newest files at the top

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
- http://YOUR_PI_IP:5000

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

### AI Assistant Setup (Ollama)
The app includes a built-in AI assistant that can help troubleshoot printer issues and modify the app's code. It runs locally using Ollama.

```bash
# Install Ollama on Raspberry Pi
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
sudo systemctl enable ollama
sudo systemctl start ollama

# Download a model (choose one based on your Pi's RAM)
# For 4GB Pi: Use smaller models
ollama pull tinyllama      # 1.1B params, ~637MB
ollama pull phi            # 2.7B params, ~1.6GB

# For 8GB Pi: Can use larger models
ollama pull llama3.2       # 3B params, ~2GB
ollama pull mistral        # 7B params, ~4GB
```

After installing, the AI chat button (robot icon) will appear in the bottom-right corner of the dashboard. The AI can:
- Answer questions about 3D printing and the app
- Read and suggest code changes
- Commit changes to Git and push to GitHub
- Restart the app after making changes

**Configuring the AI:**
Go to Settings page to change the Ollama URL (default: http://localhost:11434) and select your model.

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