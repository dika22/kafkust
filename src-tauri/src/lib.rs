mod domain;
mod infrastructure;
mod usecase;

use crate::domain::cluster::cluster::Cluster;
use crate::domain::topic::Topic;
use crate::infrastructure::kafka::KafkaInfrastructure;
use crate::infrastructure::persistence::keyring_secret_repository::KeyringSecretRepository;
use crate::infrastructure::persistence::sqlite_cluster_repository::SqliteClusterRepository;
use crate::usecase::cluster_usecase::ClusterUsecase;
use tauri::{Manager, State};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Kafka error: {0}")]
    Kafka(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub struct AppState {
    pub cluster_usecase: ClusterUsecase,
}

#[tauri::command]
async fn list_clusters(state: State<'_, AppState>) -> Result<Vec<Cluster>, Error> {
    state
        .cluster_usecase
        .list_clusters()
        .await
        .map_err(|e| Error::Internal(e.to_string()))
}

#[tauri::command]
async fn list_topics(state: State<'_, AppState>, cluster_id: Uuid) -> Result<Vec<Topic>, Error> {
    state
        .cluster_usecase
        .list_topics(cluster_id)
        .await
        .map_err(|e| Error::Kafka(e.to_string()))
}

#[tauri::command]
async fn add_cluster(
    state: State<'_, AppState>,
    cluster: Cluster,
    password: Option<String>,
) -> Result<(), Error> {
    state
        .cluster_usecase
        .add_cluster(cluster, password)
        .await
        .map_err(|e| Error::Internal(e.to_string()))
}

#[tauri::command]
async fn update_cluster(
    state: State<'_, AppState>,
    cluster: Cluster,
    password: Option<String>,
) -> Result<(), Error> {
    state
        .cluster_usecase
        .update_cluster(cluster, password)
        .await
        .map_err(|e| Error::Internal(e.to_string()))
}

#[tauri::command]
async fn create_topic(
    state: State<'_, AppState>,
    cluster_id: Uuid,
    name: String,
    partitions: i32,
    replication: i32,
) -> Result<(), Error> {
    state
        .cluster_usecase
        .create_topic(cluster_id, name, partitions, replication)
        .await
        .map_err(|e| Error::Kafka(e.to_string()))
}

#[tauri::command]
async fn publish_message(
    state: State<'_, AppState>,
    cluster_id: Uuid,
    topic: String,
    key: Option<String>,
    payload: String,
) -> Result<(), Error> {
    state
        .cluster_usecase
        .publish_message(cluster_id, topic, key, payload)
        .await
        .map_err(|e| Error::Kafka(e.to_string()))
}

#[tauri::command]
async fn delete_cluster(state: State<'_, AppState>, cluster_id: Uuid) -> Result<(), Error> {
    state
        .cluster_usecase
        .delete_cluster(cluster_id)
        .await
        .map_err(|e| Error::Internal(e.to_string()))
}

#[tauri::command]
async fn test_connection(state: State<'_, AppState>, cluster_id: Uuid) -> Result<(), Error> {
    state
        .cluster_usecase
        .check_connection(cluster_id)
        .await
        .map_err(|e| Error::Kafka(e.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let app_dir = handle
                    .path()
                    .app_data_dir()
                    .expect("Failed to get app data dir");
                println!("Database directory: {:?}", app_dir);
                if let Err(e) = std::fs::create_dir_all(&app_dir) {
                    eprintln!("Failed to create app data directory: {}", e);
                }

                let db_path = app_dir.join("kafkust.db");
                let database_url = format!("sqlite://{}", db_path.to_string_lossy());
                println!("Connecting to database at: {}", database_url);

                let cluster_repo = SqliteClusterRepository::new(&database_url)
                    .await
                    .map_err(|e| {
                        eprintln!("Database initialization failed: {}", e);
                        e
                    })
                    .expect("Failed to init DB");

                // Seed default cluster if empty
                if let Ok(clusters) = cluster_repo.list_clusters().await {
                    if clusters.is_empty() {
                        println!("Seeding default Local Kafka cluster");
                        let local_kafka = Cluster {
                            id: Uuid::new_v4(),
                            name: "Local Kafka".to_string(),
                            brokers: "localhost:9092".to_string(),
                            security: crate::domain::cluster::cluster::SecurityConfig::Plaintext,
                        };
                        let _ = cluster_repo.save_cluster(&local_kafka).await;
                    }
                }

                let secret_repo = KeyringSecretRepository::new("kafkust");
                let kafka_infra = KafkaInfrastructure::new();

                let cluster_usecase = ClusterUsecase::new(cluster_repo, secret_repo, kafka_infra);
                handle.manage(AppState { cluster_usecase });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_clusters,
            list_topics,
            add_cluster,
            update_cluster,
            delete_cluster,
            test_connection,
            create_topic,
            publish_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
