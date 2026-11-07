# Eclipse Brain OS

A cinematic digital observatory. Your skills and ideas as a living universe.

> **Status:** In development. Not yet ready for use.

## What is this?

Eclipse Brain OS is a calm, immersive way to see your own becoming.

Skills become planets. Ideas become stars. Projects become galaxies.

Pomodoro focus sessions move planets along their orbits — four cycles complete one orbit, and the planet grows slightly. Over months, your universe takes shape: the things you've actually invested in become visible, glowing, alive.

No streaks. No shame. No engagement loops. Just a quiet record of where your attention has been going.

## Status

V1 is under active development. No public release yet.

## Tech Stack

Eclipse Brain OS is built using:

- **Next.js 16** — Application framework
- **React 19** — UI library
- **TypeScript** — Type-safe development
- **Tailwind CSS 4** — Styling
- **React Three Fiber** — 3D visualization
- **Drei** — Three.js utilities
- **Three.js** — 3D graphics
- **Motion** — Animations
- **IndexedDB** — Local-first data storage
- **Node.js 24 LTS** — JavaScript runtime
- **pnpm** — Package manager
- **Vitest** — Testing framework
- **ESLint** — Code linting

## Prerequisites

Before running the project, make sure you have installed:

- [Node.js 24 LTS](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Git](https://git-scm.com/)

Check your installations:

```bash
node --version
pnpm --version
git --version
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/eclipse-brain-os.git
```

### 2. Navigate to the project directory

```bash
cd eclipse-brain-os
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Start the development server

```bash
pnpm dev
```

### 5. Open the application

Visit:

```text
http://localhost:3000
```

The development server will automatically reload when you make changes to the source code.

## AI Configuration

Eclipse Brain OS allows users to provide their own AI provider API key through the application's **Settings**.

To use AI features, open Settings in the application and enter your API key in the designated field. Each user is responsible for supplying and managing their own API key.

**Security note:** Never commit API keys or other secrets to the public repository. Do not include real keys in screenshots, example configuration files, or issue reports.

## Available Scripts

The following commands are defined in `package.json`.

| Command | Description |
|---|---|
| `pnpm dev` | Start the development server |
| `pnpm build` | Build the application for production |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:ui` | Launch the Vitest UI |
| `pnpm test:coverage` | Run tests with coverage reporting |

## Production Build

To create an optimized production build:

```bash
pnpm build
```

After the build completes, start the production server:

```bash
pnpm start
```

The application will be available at:

```text
http://localhost:3000
```

## Project Philosophy

Eclipse Brain OS is built around a simple idea:

**Your focus becomes a universe.**

Instead of tracking productivity through streaks, scores, or endless engagement loops, the application aims to provide a visual representation of the time and attention invested in your personal growth.

Your universe gradually takes shape through the things you choose to focus on.

## License

To be decided.

---

**Eclipse Brain OS — A universe shaped by your attention.**
