use chrono::{Duration, Local, TimeZone};
use serde::Serialize;
use std::collections::HashMap;

pub const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

pub struct HttpState(pub reqwest::Client);

impl HttpState {
    pub fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(15))
            .gzip(true)
            .build()
            .map_err(|e| format!("Failed to initialize HTTP client: {e}"))?;
        Ok(Self(client))
    }
}

#[derive(Debug, Clone, Serialize)]
pub enum ErrorKind {
    InvalidHandle,
    NetworkError,
    RateLimited,
    Blocked,
    ParseError,
    Timeout,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub kind: ErrorKind,
    pub message: String,
}

impl ApiError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn from_reqwest(err: reqwest::Error, platform: &str) -> Self {
        if err.is_timeout() {
            Self::new(
                ErrorKind::Timeout,
                format!("{platform} request timed out. Please try again."),
            )
        } else {
            Self::new(
                ErrorKind::NetworkError,
                format!("Unable to reach {platform}. Check your internet connection."),
            )
        }
    }
}

/// Validates a handle: 1..=40 chars, ASCII letters, digits, `_`, `-`, `.` only.
pub fn validate_handle(raw: &str) -> Result<String, ApiError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ApiError::new(
            ErrorKind::InvalidHandle,
            "Handle cannot be empty.",
        ));
    }
    if trimmed.len() > 40 {
        return Err(ApiError::new(
            ErrorKind::InvalidHandle,
            "Handle is too long (maximum 40 characters).",
        ));
    }
    if !trimmed
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.')
    {
        return Err(ApiError::new(
            ErrorKind::InvalidHandle,
            "Handle may only contain letters, numbers, '_', '-', and '.'.",
        ));
    }
    Ok(trimmed.to_string())
}

/// Percent-encodes a handle for safe URL interpolation.
pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.' {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

pub fn cutoff_365_days_ago_unix() -> i64 {
    (Local::now() - Duration::days(365)).timestamp()
}

pub fn local_date_from_unix(ts: i64) -> Option<String> {
    Local
        .timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformStatsDto {
    pub platform: String,
    pub username: String,
    pub total_solved: Option<u32>,
    pub easy_solved: Option<u32>,
    pub medium_solved: Option<u32>,
    pub hard_solved: Option<u32>,
    pub current_streak: Option<u32>,
    pub longest_streak: Option<u32>,
    pub total_submissions: Option<u32>,
    pub ranking: Option<u32>,
    pub rating: Option<i32>,
    pub max_rating: Option<i32>,
    pub rank_title: Option<String>,
    pub contests_count: Option<u32>,
    pub heatmap_data: HashMap<String, u32>,
    pub last_synced: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContestDto {
    pub id: String,
    pub platform: String,
    pub name: String,
    pub start_time: String,
    pub end_time: String,
    pub url: String,
    pub registration_url: Option<String>,
    pub registration_status: String,
    pub duration_minutes: u32,
}
