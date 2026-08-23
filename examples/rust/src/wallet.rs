//! Minimal Epic wallet Owner API v3 client.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use secp256k1::{ecdh, PublicKey, Secp256k1, SecretKey};
use serde_json::{json, Value};

pub struct EpicWallet {
    url: String,
    http: reqwest::blocking::Client,
    auth: Option<String>,
    shared_secret: Option<[u8; 32]>,
    pub token: Option<String>,
}

impl EpicWallet {
    /// Reads EPIC_OWNER_URL and EPIC_OWNER_SECRET when set, so a wallet outside the usual
    /// location works without editing this file.
    pub fn from_env() -> anyhow::Result<Self> {
        let url = std::env::var("EPIC_OWNER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:3420/v3/owner".to_string());
        let secret_path = match std::env::var("EPIC_OWNER_SECRET") {
            Ok(path) => std::path::PathBuf::from(path),
            Err(_) => dirs::home_dir()
                .ok_or_else(|| anyhow::anyhow!("no home directory"))?
                .join(".epic/main/.owner_api_secret"),
        };
        Self::new(&url, &secret_path)
    }

    pub fn new(url: &str, secret_path: &std::path::Path) -> anyhow::Result<Self> {
        // The Basic header is not what authorises a v3 call, the token is, so a missing
        // secret file is not fatal.
        let auth = std::fs::read_to_string(secret_path).ok().map(|secret| {
            format!(
                "Basic {}",
                STANDARD.encode(format!("epic:{}", secret.trim()))
            )
        });
        Ok(Self {
            url: url.to_string(),
            http: reqwest::blocking::Client::new(),
            auth,
            shared_secret: None,
            token: None,
        })
    }

    // --- transport -------------------------------------------------------

    fn post(&self, payload: Value) -> anyhow::Result<Value> {
        let mut request = self.http.post(&self.url);
        if let Some(auth) = &self.auth {
            request = request.header("Authorization", auth);
        }
        let response = request.json(&payload).send()?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            anyhow::bail!("unauthorized, check .owner_api_secret");
        }
        Self::unwrap(response.error_for_status()?.json()?)
    }

    /// Unwrap the JSON-RPC error field and Epic's inner Ok/Err envelope.
    fn unwrap(body: Value) -> anyhow::Result<Value> {
        if let Some(err) = body.get("error") {
            anyhow::bail!("JSON-RPC error: {err}");
        }
        let result = body.get("result").cloned().unwrap_or(body);
        if let Some(err) = result.get("Err") {
            anyhow::bail!("wallet error: {err}");
        }
        Ok(result.get("Ok").cloned().unwrap_or(result))
    }

    // --- handshake -------------------------------------------------------

    pub fn connect(&mut self) -> anyhow::Result<()> {
        let secp = Secp256k1::new();
        let mut seed = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut seed);
        let ephemeral = SecretKey::from_slice(&seed)?;
        let our_pubkey = PublicKey::from_secret_key(&secp, &ephemeral);

        let wallet_pubkey_hex = self.post(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "init_secure_api",
            "params": {"ecdh_pubkey": hex::encode(our_pubkey.serialize())},
        }))?;

        let wallet_pubkey =
            PublicKey::from_slice(&hex::decode(wallet_pubkey_hex.as_str().unwrap_or_default())?)?;

        // shared_secret_point returns x || y, 64 bytes. Epic uses the x coordinate
        // unhashed, so take the first 32 bytes and do NOT use SharedSecret::new,
        // which applies SHA-256.
        let point = ecdh::shared_secret_point(&wallet_pubkey, &ephemeral);
        let mut key = [0u8; 32];
        key.copy_from_slice(&point[..32]);
        self.shared_secret = Some(key);
        Ok(())
    }

    pub fn open_wallet(&mut self, password: &str) -> anyhow::Result<String> {
        if self.shared_secret.is_none() {
            self.connect()?;
        }
        let token = self.call("open_wallet", json!({"name": null, "password": password}))?;
        let token = token.as_str().unwrap_or_default().to_string();
        self.token = Some(token.clone());
        Ok(token)
    }

    // --- encryption ------------------------------------------------------

    pub fn call(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        let secret = self
            .shared_secret
            .ok_or_else(|| anyhow::anyhow!("call connect() first"))?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&secret));

        let inner = json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params});
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // aes-gcm appends the 16-byte tag to the ciphertext already.
        let sealed = cipher
            .encrypt(
                nonce,
                Payload {
                    msg: inner.to_string().as_bytes(),
                    aad: b"",
                },
            )
            .map_err(|e| anyhow::anyhow!("encrypt failed: {e}"))?;

        let envelope = self.post(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "encrypted_request_v3",
            "params": {
                "nonce": hex::encode(nonce_bytes),
                "body_enc": STANDARD.encode(&sealed),
            },
        }))?;

        let blob = STANDARD.decode(envelope["body_enc"].as_str().unwrap_or_default())?;
        let resp_nonce = hex::decode(envelope["nonce"].as_str().unwrap_or_default())?;
        let plaintext = cipher
            .decrypt(
                Nonce::from_slice(&resp_nonce),
                Payload {
                    msg: &blob,
                    aad: b"",
                },
            )
            .map_err(|e| anyhow::anyhow!("decrypt failed: {e}"))?;

        // The decrypted body is itself a JSON-RPC response, so unwrap again.
        Self::unwrap(serde_json::from_slice(&plaintext)?)
    }
}
