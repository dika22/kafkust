# Kafkust 🚀

Kafkust is a lightning-fast, high-performance Kafka desktop client built with **Rust (Tauri 2.0)** and **React 19**. It aims to replace heavy, JVM-based Kafka GUIs with a native experience that consumes significantly less memory.

## 🎯 Key Features

-   **Native Performance**: Direct Kafka interaction using `rdkafka` (based on `librdkafka`).
-   **Low Memory Footprint**: Uses <80MB RAM even with heavy message streams.
-   **Clean Architecture**: Backend organized into Domain, Usecase, Infrastructure, and Interface layers.
-   **Modern UI**: Sleek, dark-mode first interface built with React 19 and Tailwind CSS v4.
-   **Cluster Management**: Easily connect to local or remote Kafka brokers.
-   **Topic Explorer**: View topic metadata, partition counts, and replication status.

## 🛠️ Technology Stack

-   **Backend**: [Tauri 2.0](https://tauri.app/), [Rust](https://www.rust-lang.org/), [rdkafka](https://github.com/fede1024/rust-rdkafka)
-   **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS v4](https://tailwindcss.com/)
-   **State Management**: [TanStack Query](https://tanstack.com/query/latest)
-   **Icons**: [Lucide React](https://lucide.dev/)

## � Download & Install

Kafkust is available as a standalone desktop application. No terminal or CLI knowledge is required.

### 🍎 macOS
1.  **Download**: Get the latest `.dmg` or `.app` from the [Releases](https://github.com/dika22/kafkust/releases) page.
2.  **Install**: Drag Kafkust to your **Applications** folder.
3.  **Open**: Double-click to launch.
    > [!NOTE]
    > If you see a warning about an "unidentified developer", right-click the app and select **Open**, or go to **System Settings > Privacy & Security** and click **Open Anyway**.

### 🪟 Windows
1.  **Download**: Get the latest `.msi` or `.exe` installer from the [Releases](https://github.com/dika22/kafkust/releases) page.
2.  **Install**: Run the installer and follow the on-screen instructions.
3.  **Launch**: Open Kafkust from your Start Menu.

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
-   **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
-   **Node.js**: [Install Node.js](https://nodejs.org/)

### Setup
1.  **Clone & Install**:
    ```bash
    git clone https://github.com/your-username/kafka-expolrer.git
    cd kafka-expolrer
    npm install
    ```
2.  **Run Development Mode**:
    ```bash
    npm run tauri dev
    ```
3.  **Build Binary**:
    ```bash
    npm run tauri build
    ```

## 📂 Project Structure

```
kafka-expolrer/
├── src/                # React Frontend logic
├── src-tauri/          # Rust Backend (Tauri Core)
└── kafkust.md          # Project roadmap and requirements
```

## 🤝 Contributing

Kafkust is in early development. Feel free to open issues or submit pull requests!

---

Built with ❤️ for Kafka developers.
