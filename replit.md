# Snapmaker Control

## Overview

Snapmaker Control is a web-based PWA dashboard for comprehensive monitoring and control of Snapmaker 2.0 F350 3D printers. Uses a mobile-app-style bottom navigation bar with 5 views: Status, Camera, Files, Schedule, and Settings. Designed for zero-scroll on mobile devices.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter for routing, TanStack React Query for state management, shadcn/ui for UI components, Tailwind CSS v4 for styling.
- **Backend**: Node.js with Express, TypeScript, RESTful JSON API.
- **Database**: PostgreSQL with Drizzle ORM for type-safe schema management.

### Key Features
- **Real-time Monitoring**: Displays printer status, temperature, and print progress.
- **Printer Control**: Jog controls, connection management, and command execution.
- **File Management**: Supports multiple file upload methods (manual, drag & drop, slicer integration, watch folder, Luban proxy capture, Dropbox sync).
- **Webcam Integration**: Live viewing from IP cameras with support for snapshot, MJPEG, and RTSP/HLS streams.
- **Smart Plug Control**: Integration with Meross cloud API for controlling smart plugs, allowing power management for printers.
- **Scheduled Prints**: Enables scheduling G-code files for future printing, with optional smart plug power-on and push notifications.
- **Push Notifications**: Web Push API integration for alerts on print status changes, printer connectivity, and scheduled print events.
- **Authentication**: Token-based authentication for printer connections, with Luban token capture for seamless reconnections.

### Design Patterns
- **Shared Type Definitions**: `shared/` directory for common types between frontend and backend.
- **Database Abstraction**: `IStorage` interface for consistent database operations.
- **Modular Project Structure**: Clear separation of `client/`, `server/`, and `shared/` components.

## External Dependencies

- **PostgreSQL**: Primary data store for application settings, printer configurations, print jobs, and user data.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.
- **Snapmaker 2.0 F350 Printers**: Direct HTTP communication for status polling, control commands, and file transfers.
- **Meross Cloud API**: Integration for controlling Meross smart plugs via cloud REST API and MQTT.
- **IP Cameras**: Support for various IP cameras (Lorex, Dahua, Hikvision, Axis, etc.) via snapshot polling, MJPEG streams, or RTSP/HLS conversion (using ffmpeg if RTSP/HLS is enabled).
- **Web Push API**: For sending push notifications to subscribed devices.
- **Dropbox API**: Replit Dropbox connector for OAuth; auto-syncs G-code files from a configured Dropbox folder. Service in `server/dropboxService.ts`.
- **Vite & esbuild**: Build tools for frontend and backend.

## Frontend Navigation Structure

The app uses a bottom navigation bar (`BottomNav.tsx`) with 5 views:
- **Status** (`/` → `StatusPage.tsx`): Compact single-screen showing printer name, connection status, print progress, nozzle/bed temperatures, smart plug toggle, and action buttons (pause/cancel/e-stop)
- **Camera** (`/camera` → `CameraPage.tsx`): Full-screen camera feed using `WebcamFeed` component; shows setup prompt if no camera configured
- **Files** (`/files` → `FilesPage.tsx`): Full-page file list with internal scrolling using `FileList` component
- **Schedule** (`/schedule` → `SchedulePage.tsx`): Full-page scheduled prints using `ScheduledPrints` component
- **Settings** (`/settings` → `Settings.tsx`): Tabbed layout with 3 tabs:
  - **Printer**: Add/manage printers
  - **Camera**: IP camera setup
  - **More**: Push notifications, Meross smart plug, Dropbox sync, watch folder, slicer integration, Luban proxy

Old Dashboard.tsx with module registry/customize system has been removed. All modules are now split into dedicated pages.