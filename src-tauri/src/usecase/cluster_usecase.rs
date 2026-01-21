use crate::domain::cluster::cluster::Cluster;
use crate::domain::topic::{KafkaMessage, Topic};
use crate::infrastructure::kafka::KafkaInfrastructure;
use crate::infrastructure::persistence::keyring_secret_repository::KeyringSecretRepository;
use crate::infrastructure::persistence::sqlite_cluster_repository::SqliteClusterRepository;
use anyhow::Result;
use uuid::Uuid;

pub struct ClusterUsecase {
    cluster_repo: SqliteClusterRepository,
    secret_repo: KeyringSecretRepository,
    kafka_infra: KafkaInfrastructure,
}

impl ClusterUsecase {
    pub fn new(
        cluster_repo: SqliteClusterRepository,
        secret_repo: KeyringSecretRepository,
        kafka_infra: KafkaInfrastructure,
    ) -> Self {
        Self {
            cluster_repo,
            secret_repo,
            kafka_infra,
        }
    }

    pub async fn add_cluster(&self, cluster: Cluster, password: Option<String>) -> Result<()> {
        self.cluster_repo.save_cluster(&cluster).await?;
        if let Some(p) = password {
            self.secret_repo
                .save_password(&cluster.id.to_string(), &p)?;
        }
        Ok(())
    }

    pub async fn list_clusters(&self) -> Result<Vec<Cluster>> {
        self.cluster_repo.list_clusters().await
    }

    pub async fn list_topics(&self, id: Uuid) -> Result<Vec<Topic>> {
        let clusters = self.cluster_repo.list_clusters().await?;
        let cluster = clusters
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| anyhow::anyhow!("Cluster not found"))?;

        let password = self.secret_repo.get_password(&cluster.id.to_string()).ok();

        self.kafka_infra.list_topics(&cluster, password).await
    }

    pub async fn create_topic(
        &self,
        id: Uuid,
        name: String,
        partitions: i32,
        replication: i32,
    ) -> Result<()> {
        let clusters = self.cluster_repo.list_clusters().await?;
        let cluster = clusters
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| anyhow::anyhow!("Cluster not found"))?;

        let password = self.secret_repo.get_password(&cluster.id.to_string()).ok();

        self.kafka_infra
            .create_topic(&cluster, password, name, partitions, replication)
            .await
    }

    pub async fn publish_message(
        &self,
        id: Uuid,
        topic: String,
        key: Option<String>,
        payload: String,
    ) -> Result<()> {
        let clusters = self.cluster_repo.list_clusters().await?;
        let cluster = clusters
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| anyhow::anyhow!("Cluster not found"))?;

        let password = self.secret_repo.get_password(&cluster.id.to_string()).ok();

        self.kafka_infra
            .publish_message(&cluster, password, &topic, key, payload)
            .await
    }

    pub async fn update_cluster(&self, cluster: Cluster, password: Option<String>) -> Result<()> {
        self.cluster_repo.save_cluster(&cluster).await?;
        if let Some(p) = password {
            if !p.is_empty() {
                self.secret_repo
                    .save_password(&cluster.id.to_string(), &p)?;
            }
        }
        Ok(())
    }

    pub async fn delete_cluster(&self, id: Uuid) -> Result<()> {
        self.cluster_repo.delete_cluster(&id).await?;
        let _ = self.secret_repo.delete_password(&id.to_string());
        Ok(())
    }

    pub async fn check_connection(&self, id: Uuid) -> Result<()> {
        let clusters = self.cluster_repo.list_clusters().await?;
        let cluster = clusters
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| anyhow::anyhow!("Cluster not found"))?;

        let password = self.secret_repo.get_password(&cluster.id.to_string()).ok();

        self.kafka_infra.check_connection(&cluster, password).await
    }

    pub async fn consume_messages(
        &self,
        id: Uuid,
        topic: String,
        max_messages: usize,
    ) -> Result<Vec<KafkaMessage>> {
        let clusters = self.cluster_repo.list_clusters().await?;
        let cluster = clusters
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| anyhow::anyhow!("Cluster not found"))?;

        let password = self.secret_repo.get_password(&cluster.id.to_string()).ok();

        self.kafka_infra
            .consume_messages(&cluster, password, &topic, max_messages)
            .await
    }

    pub async fn get_topic_message_count(&self, id: Uuid, topic: String) -> Result<i64> {
        let clusters = self.cluster_repo.list_clusters().await?;
        let cluster = clusters
            .into_iter()
            .find(|c| c.id == id)
            .ok_or_else(|| anyhow::anyhow!("Cluster not found"))?;

        let password = self.secret_repo.get_password(&cluster.id.to_string()).ok();

        self.kafka_infra
            .get_topic_message_count(&cluster, password, &topic)
            .await
    }
}
