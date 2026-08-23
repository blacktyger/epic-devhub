//! Print chain status from a local Epic node.

use epic_examples::node::NodeClient;
use serde_json::json;

fn main() -> anyhow::Result<()> {
    let client = NodeClient::new()?;

    let status = client.call("get_status", json!([]))?;
    println!("height:     {}", status["tip"]["height"]);
    println!(
        "sync state: {}",
        status["sync_status"].as_str().unwrap_or("unknown")
    );
    println!("peers:      {}", status["connections"]);

    let tip = client.call_on("foreign", "get_tip", json!([]))?;
    println!(
        "tip hash:   {}",
        tip["last_block_pushed"].as_str().unwrap_or_default()
    );
    Ok(())
}
