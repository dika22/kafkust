# Kafkust 🚀

Kafkust is a lightning-fast, high-performance Kafka client built with **Rust (Tauri 2.0)** and **React 19**. It aims to replace heavy, JVM-based Kafka GUIs with a native experience that consumes significantly less memory.

**Available as both a Desktop App and Web App!**

## 🎯 Key Features

-   **Dual Mode**: Run as a native desktop app OR in your browser
-   **Native Performance**: Direct Kafka interaction using `rdkafka` (desktop) or `kafkajs` (web)
-   **Low Memory Footprint**: Desktop uses <80MB RAM even with heavy message streams
-   **Clean Architecture**: Backend organized into Domain, Usecase, Infrastructure, and Interface layers
-   **Modern UI**: Sleek, dark-mode first interface built with React 19 and Tailwind CSS v4
-   **Cluster Management**: Easily connect to local or remote Kafka brokers
-   **Topic Explorer**: View topic metadata, partition counts, and replication status
-   **Producer Lab**: Compose and publish messages with a built-in JSON editor
-   **Message Viewer**: Browse and inspect messages from any topic

## 🛠️ Technology Stack

-   **Desktop Backend**: [Tauri 2.0](https://tauri.app/), [Rust](https://www.rust-lang.org/), [rdkafka](https://github.com/fede1024/rust-rdkafka)
-   **Web Backend**: [Express](https://expressjs.com/), [KafkaJS](https://kafka.js.org/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
-   **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/)
-   **State Management**: [TanStack Query](https://tanstack.com/query/latest)
-   **Icons**: [Lucide React](https://lucide.dev/)

## 📦 Download & Install

Kafkust is available as a standalone desktop application. No terminal or CLI knowledge is required.


### 🐧 Linux

```bash
# Install prerequisites (Debian/Ubuntu)
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone and build
git clone https://github.com/dika22/kafkust.git
cd kafkust
npm install
npm run tauri build

# The app will be in src-tauri/target/release/bundle/
```

---

## 🎮 Quick Usage Guide

1.  **Connect**: Click the **"+" (Plus icon)** in the sidebar to add a new Kafka cluster.
2.  **Configure**: Enter your **Broker URL** (e.g., `localhost:9092`) and give it a nickname.
3.  **Explore**: Select your cluster from the sidebar to see all active topics.
4.  **Manage**: Use the **Topics Explorer** to view partitions, replication, and more.

---

## 🛠️ Development Guide

If you want to build Kafkust from source or contribute to the project:

### Prerequisites
-   **Node.js**: [Install Node.js](https://nodejs.org/) (v18+)
-   **Rust**: [Install Rust](https://www.rust-lang.org/tools/install) (only for desktop mode)

### Setup
```bash
git clone https://github.com/dika22/kafkust.git
cd kafkust
npm install
cd server && npm install && cd ..
```

### Running the App

#### Web Mode (Browser)
Run both the Node.js backend server and Vite frontend:
```bash
npm run web
```
Then open http://localhost:5173 in your browser.

#### Desktop Mode (Native)
Run the Tauri desktop app with native Rust backend:
```bash
npm run tauri dev
```

#### Build Desktop Binary
```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

## 📂 Project Structure

```
kafkust/
├── src/                # React Frontend
│   ├── api/            # API bridge (Tauri/HTTP auto-detection)
│   └── components/     # React components
├── src-tauri/          # Rust Backend (Desktop)
│   └── src/
│       ├── domain/     # Domain models
│       ├── infrastructure/  # Kafka & DB implementations
│       └── usecase/    # Business logic
├── server/             # Node.js Backend (Web)
│   └── src/
│       ├── index.ts    # Express API server
│       ├── db.ts       # SQLite database
│       └── kafka.ts    # KafkaJS operations
└── kafkust.md          # Project roadmap
```

## 🤝 Contributing

Kafkust is in early development. Feel free to open issues or submit pull requests!

---

Built with ❤️ for Kafka developers.
