use anyhow::{anyhow, Result};
use keyring::Entry;

pub struct KeyringSecretRepository {
    service_name: String,
}

impl KeyringSecretRepository {
    pub fn new(service_name: &str) -> Self {
        Self {
            service_name: service_name.to_string(),
        }
    }

    pub fn save_password(&self, cluster_id: &str, password: &str) -> Result<()> {
        let entry = Entry::new(&self.service_name, cluster_id)
            .map_err(|e| anyhow!("Failed to create keyring entry: {}", e))?;
        entry
            .set_password(password)
            .map_err(|e| anyhow!("Failed to save password to keyring: {}", e))?;
        Ok(())
    }

    pub fn get_password(&self, cluster_id: &str) -> Result<String> {
        let entry = Entry::new(&self.service_name, cluster_id)
            .map_err(|e| anyhow!("Failed to create keyring entry: {}", e))?;
        entry
            .get_password()
            .map_err(|e| anyhow!("Failed to retrieve password from keyring: {}", e))
    }

    pub fn delete_password(&self, cluster_id: &str) -> Result<()> {
        let entry = Entry::new(&self.service_name, cluster_id)
            .map_err(|e| anyhow!("Failed to create keyring entry: {}", e))?;
        entry
            .delete_credential()
            .map_err(|e| anyhow!("Failed to delete password from keyring: {}", e))?;
        Ok(())
    }
}
