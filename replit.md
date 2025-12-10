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
- Auto-reconnect feature: When disconnected, monitors if printer comes online and attempts automatic reconnection using saved token
- **File tracking workaround**: Snapmaker API doesn't support file listing. Users manually add filenames to track files uploaded via Luban. Files are stored in the `uploadedFiles` database table.
- **Multiple file upload methods**:
  - Manual upload via file picker in FileList component
  - Drag & drop anywhere on the dashboard (global drop zone with overlay)
  - Slicer integration: OctoPrint-compatible endpoints at `/api/files/local` and `/api/upload` for Cura, PrusaSlicer, etc.
  - Watch folder: Configure a local folder path in Settings; new G-code files are auto-imported (uses `server/fileWatcher.ts`)
  - Luban auto-capture: Proxy server intercepts Luban uploads, captures files automatically, and forwards to printer (uses `server/lubanProxy.ts`)
- **Luban token capture**: When Luban connects through the proxy, the app captures and saves Luban's authentication token. This token is then used for prompt-free connections - no touchscreen confirmation needed after the first Luban connection.
- Customizable dashboard: Users can toggle modules (status, webcam, temperature, jog controls, job controls, file list) on/off via the customize panel

### UI Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Recharts**: Temperature history charting
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component support

### Build & Development
- **Vite**: Frontend bundler with HMR
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development