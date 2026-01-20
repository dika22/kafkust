use crate::domain::cluster::cluster::{Cluster, SaslMechanism, SecurityConfig};
use crate::domain::topic::Topic;
use anyhow::Result;
use rdkafka::admin::AdminClient;
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use std::time::Duration;

pub struct KafkaInfrastructure;

impl KafkaInfrastructure {
    pub fn new() -> Self {
        Self
    }

    fn create_config(&self, cluster: &Cluster, password: Option<String>) -> ClientConfig {
        let mut config = ClientConfig::new();
        config.set("bootstrap.servers", &cluster.brokers);

        match &cluster.security {
            SecurityConfig::Plaintext => {
                config.set("security.protocol", "plaintext");
            }
            SecurityConfig::Ssl {
                ca_location,
                certificate_location,
                key_location,
                key_password,
            } => {
                config.set("security.protocol", "ssl");
                if let Some(ca) = ca_location {
                    config.set("ssl.ca.location", ca);
                }
                if let Some(cert) = certificate_location {
                    config.set("ssl.certificate.location", cert);
                }
                if let Some(key) = key_location {
                    config.set("ssl.key.location", key);
                }
                if let Some(kp) = key_password {
                    config.set("ssl.key.password", kp);
                }
            }
            SecurityConfig::SaslSsl {
                mechanism,
                username,
                ca_location,
            } => {
                config.set("security.protocol", "sasl_ssl");
                let mech_str = match mechanism {
                    SaslMechanism::Plain => "PLAIN",
                    SaslMechanism::ScramSha256 => "SCRAM-SHA-256",
                    SaslMechanism::ScramSha512 => "SCRAM-SHA-512",
                    SaslMechanism::Gssapi => "GSSAPI",
                    SaslMechanism::OAuthBearer => "OAUTHBEARER",
                };
                config.set("sasl.mechanism", mech_str);
                config.set("sasl.username", username);
                if let Some(p) = password {
                    config.set("sasl.password", &p);
                }
                if let Some(ca) = ca_location {
                    config.set("ssl.ca.location", ca);
                }
            }
        }
        config
    }

    pub async fn list_topics(
        &self,
        cluster: &Cluster,
        password: Option<String>,
    ) -> Result<Vec<Topic>> {
        let client: AdminClient<DefaultClientContext> =
            self.create_config(cluster, password).create()?;

        println!(
            "Fetching metadata for cluster: {} at {}",
            cluster.name, cluster.brokers
        );
        let metadata = client
            .inner()
            .fetch_metadata(None, Duration::from_secs(5))
            .map_err(|e| {
                anyhow::anyhow!("Failed to fetch metadata from {}: {}", cluster.brokers, e)
            })?;

        let topics = metadata
            .topics()
            .iter()
            .map(|t| Topic {
                name: t.name().to_string(),
                partitions: t.partitions().len() as i32,
                replication_factor: 1,
            })
            .collect();

        println!("Successfully fetched {} topics", metadata.topics().len());
        Ok(topics)
    }

    pub async fn check_connection(
        &self,
        cluster: &Cluster,
        password: Option<String>,
    ) -> Result<()> {
        let client: AdminClient<DefaultClientContext> =
            self.create_config(cluster, password).create()?;

        // Simple metadata fetch for a non-existent topic to test connectivity
        client
            .inner()
            .fetch_metadata(None, Duration::from_secs(3))
            .map_err(|e| {
                anyhow::anyhow!("Connection check failed for {}: {}", cluster.brokers, e)
            })?;

        Ok(())
    }

    pub async fn create_topic(
        &self,
        cluster: &Cluster,
        password: Option<String>,
        name: String,
        partitions: i32,
        replication: i32,
    ) -> Result<()> {
        use rdkafka::admin::{AdminOptions, NewTopic, TopicReplication};

        let client: AdminClient<DefaultClientContext> =
            self.create_config(cluster, password).create()?;

        let new_topic = NewTopic::new(&name, partitions, TopicReplication::Fixed(replication));

        let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(30)));

        let results = client
            .create_topics(&[new_topic], &opts)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to create topic: {}", e))?;

        for result in results {
            match result {
                Ok(_) => {}
                Err((topic, code)) => {
                    return Err(anyhow::anyhow!(
                        "Failed to create topic '{}': {:?}",
                        topic,
                        code
                    ));
                }
            }
        }

        Ok(())
    }

    pub async fn publish_message(
        &self,
        cluster: &Cluster,
        password: Option<String>,
        topic: &str,
        key: Option<String>,
        payload: String,
    ) -> Result<()> {
        use rdkafka::producer::{FutureProducer, FutureRecord};

        let producer: FutureProducer = self.create_config(cluster, password).create()?;

        let mut record = FutureRecord::to(topic).payload(&payload);

        if let Some(ref k) = key {
            record = record.key(k);
        }

        producer
            .send(record, Duration::from_secs(5))
            .await
            .map_err(|(e, _)| anyhow::anyhow!("Failed to publish message: {}", e))?;

        Ok(())
    }
}
