use crate::domain::cluster::cluster::{Cluster, SaslMechanism, SecurityConfig};
use crate::domain::topic::{KafkaMessage, Topic};
use anyhow::Result;
use rdkafka::admin::AdminClient;
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::Message;
use rdkafka::TopicPartitionList;
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

    pub async fn consume_messages(
        &self,
        cluster: &Cluster,
        password: Option<String>,
        topic: &str,
        max_messages: usize,
    ) -> Result<Vec<KafkaMessage>> {
        let mut config = self.create_config(cluster, password);
        config.set("group.id", format!("kafkust-consumer-{}", uuid::Uuid::new_v4()));
        config.set("auto.offset.reset", "latest");
        config.set("enable.auto.commit", "false");

        let consumer: BaseConsumer = config.create()?;

        let metadata = consumer
            .fetch_metadata(Some(topic), Duration::from_secs(5))
            .map_err(|e| anyhow::anyhow!("Failed to fetch topic metadata: {}", e))?;

        let topic_metadata = metadata
            .topics()
            .iter()
            .find(|t| t.name() == topic)
            .ok_or_else(|| anyhow::anyhow!("Topic not found"))?;

        let partition_count = topic_metadata.partitions().len() as i32;

        let mut tpl = TopicPartitionList::new();
        for p in 0..partition_count {
            tpl.add_partition(topic, p);
        }

        let watermarks_result: Result<Vec<(i32, i64, i64)>, _> = (0..partition_count)
            .map(|p| {
                consumer
                    .fetch_watermarks(topic, p, Duration::from_secs(5))
                    .map(|(low, high)| (p, low, high))
            })
            .collect();

        let watermarks = watermarks_result
            .map_err(|e| anyhow::anyhow!("Failed to fetch watermarks: {}", e))?;

        let mut offset_tpl = TopicPartitionList::new();
        for (partition, _low, high) in &watermarks {
            let start_offset = (*high as usize).saturating_sub(max_messages / partition_count as usize);
            offset_tpl
                .add_partition_offset(topic, *partition, rdkafka::Offset::Offset(start_offset as i64))
                .map_err(|e| anyhow::anyhow!("Failed to set offset: {}", e))?;
        }

        consumer
            .assign(&offset_tpl)
            .map_err(|e| anyhow::anyhow!("Failed to assign partitions: {}", e))?;

        let mut messages = Vec::new();
        let timeout = Duration::from_millis(100);
        let max_attempts = 50;

        for _ in 0..max_attempts {
            if messages.len() >= max_messages {
                break;
            }

            match consumer.poll(timeout) {
                Some(Ok(msg)) => {
                    let kafka_msg = KafkaMessage {
                        partition: msg.partition(),
                        offset: msg.offset(),
                        timestamp: msg.timestamp().to_millis(),
                        key: msg.key().map(|k| String::from_utf8_lossy(k).to_string()),
                        payload: msg.payload().map(|p| String::from_utf8_lossy(p).to_string()),
                    };
                    messages.push(kafka_msg);
                }
                Some(Err(e)) => {
                    eprintln!("Error consuming message: {}", e);
                }
                None => {
                    if messages.is_empty() {
                        continue;
                    }
                    break;
                }
            }
        }

        messages.sort_by(|a, b| b.offset.cmp(&a.offset));

        Ok(messages)
    }

    pub async fn get_topic_message_count(
        &self,
        cluster: &Cluster,
        password: Option<String>,
        topic: &str,
    ) -> Result<i64> {
        let config = self.create_config(cluster, password);
        let consumer: BaseConsumer = config.create()?;

        let metadata = consumer
            .fetch_metadata(Some(topic), Duration::from_secs(5))
            .map_err(|e| anyhow::anyhow!("Failed to fetch topic metadata: {}", e))?;

        let topic_metadata = metadata
            .topics()
            .iter()
            .find(|t| t.name() == topic)
            .ok_or_else(|| anyhow::anyhow!("Topic not found"))?;

        let partition_count = topic_metadata.partitions().len() as i32;

        let mut total_messages: i64 = 0;
        for p in 0..partition_count {
            let (low, high) = consumer
                .fetch_watermarks(topic, p, Duration::from_secs(5))
                .map_err(|e| anyhow::anyhow!("Failed to fetch watermarks: {}", e))?;
            total_messages += high - low;
        }

        Ok(total_messages)
    }
}
