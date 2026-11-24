use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

use crate::net::{
    cutoff_365_days_ago_unix, local_date_from_unix, url_encode, ApiError, ContestDto, ErrorKind,
    PlatformStatsDto,
};

const CF_BASE: &str = "https://codeforces.com/api";

#[derive(Deserialize)]
struct CfEnvelope<T> {
    status: String,
    result: Option<T>,
    comment: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfUser {
    handle: String,
    rating: Option<i32>,
    max_rating: Option<i32>,
    rank: Option<String>,
    #[allow(dead_code)]
    max_rank: Option<String>,
    #[allow(dead_code)]
    avatar: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfRatingChange {
    #[allow(dead_code)]
    contest_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfProblem {
    contest_id: Option<i64>,
    problemset_name: Option<String>,
    index: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfSubmission {
    creation_time_seconds: i64,
    verdict: Option<String>,
    problem: CfProblem,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfContest {
    id: i64,
    name: String,
    phase: String,
    start_time_seconds: i64,
    duration_seconds: i64,
}

async fn cf_get<T: for<'de> Deserialize<'de>>(
    client: &reqwest::Client,
    path: &str,
) -> Result<T, ApiError> {
    let url = format!("{CF_BASE}{path}");
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| ApiError::from_reqwest(e, "Codeforces"))?;

    let status_code = resp.status();
    if status_code.as_u16() == 429 || status_code.as_u16() == 503 {
        return Err(ApiError::new(
            ErrorKind::RateLimited,
            "Codeforces rate limit reached. Please wait a moment.",
        ));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| ApiError::from_reqwest(e, "Codeforces"))?;

    let env: CfEnvelope<T> = serde_json::from_str(&text).map_err(|e| {
        ApiError::new(
            ErrorKind::ParseError,
            format!("Invalid Codeforces JSON response: {e}"),
        )
    })?;

    if env.status != "OK" {
        let comment = env.comment.unwrap_or_else(|| "Codeforces API error".into());
        let lower = comment.to_lowercase();
        if lower.contains("not found") {
            return Err(ApiError::new(
                ErrorKind::InvalidHandle,
                "Invalid handle — account not found on Codeforces.",
            ));
        }
        if lower.contains("call limit") {
            return Err(ApiError::new(
                ErrorKind::RateLimited,
                "Codeforces API call limit exceeded.",
            ));
        }
        return Err(ApiError::new(
            ErrorKind::NetworkError,
            format!("Codeforces error: {comment}"),
        ));
    }

    env.result.ok_or_else(|| {
        ApiError::new(
            ErrorKind::ParseError,
            "Codeforces returned OK without a result payload.",
        )
    })
}

pub async fn fetch_stats(
    client: &reqwest::Client,
    handle: &str,
) -> Result<PlatformStatsDto, ApiError> {
    let enc = url_encode(handle);

    // 1. Validate user & fetch profile via user.info
    let users: Vec<CfUser> = cf_get(client, &format!("/user.info?handles={enc}")).await?;
    let user = users.into_iter().next().ok_or_else(|| {
        ApiError::new(
            ErrorKind::InvalidHandle,
            "Invalid handle — account not found on Codeforces.",
        )
    })?;

    // Respect CF rate limit (~5 req / 2s): brief spacing before rating & status
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;

    // 2. Fetch submission history (last 10,000) & rating history
    let submissions: Vec<CfSubmission> = cf_get(
        client,
        &format!("/user.status?handle={enc}&from=1&count=10000"),
    )
    .await
    .unwrap_or_default();

    tokio::time::sleep(std::time::Duration::from_millis(250)).await;

    let rating_changes: Vec<CfRatingChange> =
        cf_get(client, &format!("/user.rating?handle={enc}"))
            .await
            .unwrap_or_default();

    // 3. Unique solved problems + 365-day local-date heatmap
    let cutoff = cutoff_365_days_ago_unix();
    let mut heatmap_data: HashMap<String, u32> = HashMap::new();
    let mut solved_keys: HashSet<String> = HashSet::new();

    for sub in &submissions {
        if sub.creation_time_seconds >= cutoff {
            if let Some(day) = local_date_from_unix(sub.creation_time_seconds) {
                *heatmap_data.entry(day).or_insert(0) += 1;
            }
        }
        if sub.verdict.as_deref() == Some("OK") {
            let key = match sub.problem.contest_id {
                Some(cid) => format!("{cid}-{}", sub.problem.index),
                None => format!(
                    "ps-{}-{}",
                    sub.problem.problemset_name.as_deref().unwrap_or(""),
                    sub.problem.name
                ),
            };
            solved_keys.insert(key);
        }
    }

    Ok(PlatformStatsDto {
        platform: "codeforces".to_string(),
        username: user.handle,
        total_solved: Some(solved_keys.len() as u32),
        easy_solved: None,
        medium_solved: None,
        hard_solved: None,
        current_streak: None,
        longest_streak: None,
        total_submissions: Some(submissions.len() as u32),
        ranking: None,
        rating: user.rating,
        max_rating: user.max_rating,
        rank_title: user.rank,
        contests_count: Some(rating_changes.len() as u32),
        heatmap_data,
        last_synced: Utc::now().to_rfc3339(),
        error: None,
    })
}

pub async fn fetch_contests(client: &reqwest::Client) -> Result<Vec<ContestDto>, ApiError> {
    let contests: Vec<CfContest> = cf_get(client, "/contest.list?gym=false").await?;
    let now = Utc::now().timestamp();

    let mut upcoming: Vec<CfContest> = contests
        .into_iter()
        .filter(|c| c.phase == "BEFORE" && c.start_time_seconds > now)
        .collect();
    upcoming.sort_by_key(|c| c.start_time_seconds);
    upcoming.truncate(10);

    let out = upcoming
        .into_iter()
        .filter_map(|c| {
            let start = DateTime::from_timestamp(c.start_time_seconds, 0)?;
            let end = DateTime::from_timestamp(c.start_time_seconds + c.duration_seconds, 0)?;
            Some(ContestDto {
                id: format!("cf-{}", c.id),
                platform: "codeforces".to_string(),
                name: c.name,
                start_time: start.to_rfc3339(),
                end_time: end.to_rfc3339(),
                url: format!("https://codeforces.com/contest/{}", c.id),
                registration_url: Some(format!(
                    "https://codeforces.com/contestRegistration/{}",
                    c.id
                )),
                registration_status: "unknown".to_string(),
                duration_minutes: (c.duration_seconds / 60).max(0) as u32,
            })
        })
        .collect();

    Ok(out)
}
