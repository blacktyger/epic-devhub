//! Minimal Epic node JSON-RPC client.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};

pub const DEFAULT_NODE_URL: &str = "http://127.0.0.1:3413";

pub struct NodeClient {
    url: String,
    http: reqwest::blocking::Client,
    /// Only the owner surface needs a credential. Chain reads on /v2/foreign send none, so
    /// a missing secret file is not fatal.
    auth: Option<String>,
}

impl NodeClient {
    /// Reads NODE_URL and EPIC_NETWORK when set, so the same binary works against a local
    /// usernet chain: `NODE_URL=http://127.0.0.1:23413 EPIC_NETWORK=user`.
    pub fn new() -> anyhow::Result<Self> {
        let url = std::env::var("NODE_URL").unwrap_or_else(|_| DEFAULT_NODE_URL.to_string());
        let network = std::env::var("EPIC_NETWORK").unwrap_or_else(|_| "main".to_string());
        let secret_path = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("no home directory"))?
            .join(format!(".epic/{network}/.api_secret"));
        Self::with_url(&url, &secret_path)
    }

    pub fn with_url(url: &str, secret_path: &std::path::Path) -> anyhow::Result<Self> {
        let auth = match std::fs::read_to_string(secret_path) {
            Ok(secret) => Some(format!(
                "Basic {}",
                STANDARD.encode(format!("epic:{}", secret.trim()))
            )),
            Err(_) => None,
        };
        Ok(Self {
            url: url.to_string(),
            http: reqwest::blocking::Client::new(),
            auth,
        })
    }

    /// Owner surface: status, chain validation and compaction, peer management.
    pub fn call(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        self.call_on("owner", method, params)
    }

    /// `surface` is "owner" or "foreign". Every chain read is on "foreign".
    pub fn call_on(&self, surface: &str, method: &str, params: Value) -> anyhow::Result<Value> {
        let mut request = self.http.post(format!("{}/v2/{surface}", self.url));
        if let Some(auth) = &self.auth {
            request = request.header("Authorization", auth);
        }

        let body: Value = request
            .json(&json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}))
            .send()?
            .error_for_status()?
            .json()?;

        if let Some(err) = body.get("error") {
            anyhow::bail!("JSON-RPC error: {err}");
        }
        let result = &body["result"];
        if let Some(err) = result.get("Err") {
            anyhow::bail!("node error: {err}");
        }
        Ok(result["Ok"].clone())
    }

    /// Fetch a block by height or by hash. Foreign surface, positional params.
    pub fn get_block(&self, height: Option<u64>, hash: Option<&str>) -> anyhow::Result<Value> {
        self.call_on("foreign", "get_block", json!([height, hash, Value::Null]))
    }
}
