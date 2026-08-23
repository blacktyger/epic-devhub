//! Read an Epic wallet balance through the Owner API v3.

use epic_examples::wallet::EpicWallet;
use serde_json::{json, Value};

fn main() -> anyhow::Result<()> {
    let password = std::env::var("EPIC_WALLET_PASSWORD")
        .map_err(|_| anyhow::anyhow!("set EPIC_WALLET_PASSWORD"))?;

    let mut wallet = EpicWallet::from_env()?;
    wallet.open_wallet(&password)?;

    // retrieve_summary_info returns [validated_against_node, WalletInfo]
    let info = wallet.call(
        "retrieve_summary_info",
        json!({
            "token": wallet.token,
            "refresh_from_node": true,
            "minimum_confirmations": 3
        }),
    )?;

    let summary = &info[1];
    let epic = |v: &Value| v.as_str().unwrap_or("0").parse::<u64>().unwrap_or(0) as f64 / 1e8;
    // last_confirmed_height is a JSON string like every other u64 on this surface.
    println!(
        "height:    {}",
        summary["last_confirmed_height"].as_str().unwrap_or("0")
    );
    println!("total:     {:.8} EPIC", epic(&summary["total"]));
    println!(
        "spendable: {:.8} EPIC",
        epic(&summary["amount_currently_spendable"])
    );
    println!("locked:    {:.8} EPIC", epic(&summary["amount_locked"]));
    Ok(())
}
