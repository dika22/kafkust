use crate::domain::cluster::cluster::{Cluster, SaslMechanism, SecurityConfig};
use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use uuid::Uuid;

pub struct SqliteClusterRepository {
    pool: Pool<Sqlite>,
}

impl SqliteClusterRepository {
    pub async fn new(database_url: &str) -> Result<Self> {
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;

        let options = SqliteConnectOptions::from_str(database_url)?.create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        // Simplified migration
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS clusters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                brokers TEXT NOT NULL,
                security_type TEXT NOT NULL,
                sasl_mechanism TEXT,
                sasl_username TEXT,
                ca_location TEXT,
                cert_location TEXT,
                key_location TEXT
            )",
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub async fn save_cluster(&self, cluster: &Cluster) -> Result<()> {
        let (st, mech, user, ca, cert, key) = match &cluster.security {
            SecurityConfig::Plaintext => ("plaintext", None, None, None, None, None),
            SecurityConfig::Ssl {
                ca_location,
                certificate_location,
                key_location,
                ..
            } => (
                "ssl",
                None,
                None,
                ca_location.as_deref(),
                certificate_location.as_deref(),
                key_location.as_deref(),
            ),
            SecurityConfig::SaslSsl {
                mechanism,
                username,
                ca_location,
            } => {
                let m = match mechanism {
                    SaslMechanism::Plain => "PLAIN",
                    SaslMechanism::ScramSha256 => "SCRAM-SHA-256",
                    SaslMechanism::ScramSha512 => "SCRAM-SHA-512",
                    SaslMechanism::Gssapi => "GSSAPI",
                    SaslMechanism::OAuthBearer => "OAUTHBEARER",
                };
                (
                    "sasl_ssl",
                    Some(m),
                    Some(username.as_str()),
                    ca_location.as_deref(),
                    None,
                    None,
                )
            }
        };

        sqlx::query(
            "INSERT OR REPLACE INTO clusters (id, name, brokers, security_type, sasl_mechanism, sasl_username, ca_location, cert_location, key_location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(cluster.id.to_string())
        .bind(&cluster.name)
        .bind(&cluster.brokers)
        .bind(st)
        .bind(mech)
        .bind(user)
        .bind(ca)
        .bind(cert)
        .bind(key)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_clusters(&self) -> Result<Vec<Cluster>> {
        let rows = sqlx::query("SELECT id, name, brokers, security_type, sasl_mechanism, sasl_username, ca_location, cert_location, key_location FROM clusters")
            .fetch_all(&self.pool)
            .await?;

        let clusters = rows
            .into_iter()
            .map(|row| {
                let id: String = sqlx::Row::get(&row, 0);
                let name: String = sqlx::Row::get(&row, 1);
                let brokers: String = sqlx::Row::get(&row, 2);
                let st: String = sqlx::Row::get(&row, 3);
                let mech_str: Option<String> = sqlx::Row::get(&row, 4);
                let username: Option<String> = sqlx::Row::get(&row, 5);
                let ca_location: Option<String> = sqlx::Row::get(&row, 6);
                let cert_location: Option<String> = sqlx::Row::get(&row, 7);
                let key_location: Option<String> = sqlx::Row::get(&row, 8);

                let security = match st.as_str() {
                    "plaintext" => SecurityConfig::Plaintext,
                    "ssl" => SecurityConfig::Ssl {
                        ca_location,
                        certificate_location: cert_location,
                        key_location,
                        key_password: None,
                    },
                    "sasl_ssl" => {
                        let mechanism = match mech_str.as_deref() {
                            Some("SCRAM-SHA-256") => SaslMechanism::ScramSha256,
                            Some("SCRAM-SHA-512") => SaslMechanism::ScramSha512,
                            Some("GSSAPI") => SaslMechanism::Gssapi,
                            Some("OAUTHBEARER") => SaslMechanism::OAuthBearer,
                            _ => SaslMechanism::Plain,
                        };
                        SecurityConfig::SaslSsl {
                            mechanism,
                            username: username.unwrap_or_default(),
                            ca_location,
                        }
                    }
                    _ => SecurityConfig::Plaintext,
                };

                Cluster {
                    id: Uuid::parse_str(&id).unwrap_or_default(),
                    name,
                    brokers,
                    security,
                }
            })
            .collect();

        Ok(clusters)
    }

    pub async fn delete_cluster(&self, id: &Uuid) -> Result<()> {
        sqlx::query("DELETE FROM clusters WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
