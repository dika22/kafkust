use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Cluster {
    pub id: Uuid,
    pub name: String,
    pub brokers: String,
    pub security: SecurityConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "config")]
pub enum SecurityConfig {
    Plaintext,
    Ssl {
        ca_location: Option<String>,
        certificate_location: Option<String>,
        key_location: Option<String>,
        key_password: Option<String>,
    },
    SaslSsl {
        mechanism: SaslMechanism,
        username: String,
        // Password is stored in keyring
        ca_location: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SaslMechanism {
    Plain,
    ScramSha256,
    ScramSha512,
    Gssapi,
    OAuthBearer,
}
