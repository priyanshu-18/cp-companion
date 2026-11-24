use crate::net::{ApiError, ContestDto, ErrorKind, PlatformStatsDto};

pub async fn fetch_stats(_client: &reqwest::Client, _handle: &str) -> Result<PlatformStatsDto, ApiError> {
    Err(ApiError::new(
        ErrorKind::NetworkError,
        "CodeChef integration not yet wired.",
    ))
}

pub async fn fetch_contests(_client: &reqwest::Client) -> Result<Vec<ContestDto>, ApiError> {
    Ok(Vec::new())
}
