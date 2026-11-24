//! CodeChef scraper & contest fetcher.
//!
//! CodeChef has no official unauthenticated REST API for user profiles, so we
//! fetch the public profile HTML at `https://www.codechef.com/users/{handle}`
//! and extract fields with `scraper` + targeted JSON slicing.
//!
//! Selectors & embedded structures (verified 2026-11):
//!   - Profile existence: `Drupal.settings` `"currentUser":"..."` or
//!     `Total Problems Solved:` heading or `div.rating-number`.
//!   - Rating (rated accounts only): `div.rating-number` (integer text)
//!   - Stars (rated accounts only): `div.rating-star span` count
//!   - Global rank (rated accounts only): `.rating-ranks ul li a strong`
//!   - Problems solved: `section.problems-solved h3` -> `"Total Problems Solved: N"`
//!   - Peak rating & contest count: `Drupal.settings` -> `date_versus_rating.all`
//!   - Daily activity heatmap: `var userDailySubmissionsStats = [...];`
//!
//! Contests use the public JSON endpoint:
//!   `https://www.codechef.com/api/list/contests/all` (`future_contests`).

use chrono::{Duration, Local, Utc};
use scraper::{Html, Selector};
use serde::Deserialize;
use std::collections::HashMap;

use crate::net::{url_encode, ApiError, ContestDto, ErrorKind, PlatformStatsDto};

#[derive(Deserialize)]
struct CcDailyStat {
    date: String,
    #[serde(deserialize_with = "de_u32_or_str")]
    value: u32,
}

fn de_u32_or_str<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Val {
        Num(u32),
        Str(String),
    }
    match Val::deserialize(deserializer)? {
        Val::Num(n) => Ok(n),
        Val::Str(s) => Ok(s.trim().parse::<u32>().unwrap_or(0)),
    }
}

#[derive(Deserialize)]
struct CcContestsResp {
    future_contests: Option<Vec<CcFutureContest>>,
}

#[derive(Deserialize)]
struct CcFutureContest {
    contest_code: String,
    contest_name: String,
    contest_start_date_iso: String,
    contest_end_date_iso: Option<String>,
    contest_duration: Option<String>,
}

fn is_cloudflare_challenge(html: &str) -> bool {
    html.contains("cf-browser-verification")
        || html.contains("Just a moment...")
        || html.contains("Enable JavaScript and cookies to continue")
        || html.contains("Attention Required! | Cloudflare")
}

/// Extracts a balanced JSON value (`{...}` or `[...]`) starting after `marker`.
fn extract_json_after(html: &str, marker: &str, open: char, close: char) -> Option<String> {
    let idx = html.find(marker)?;
    let rest = &html[idx + marker.len()..];
    let start = rest.find(open)?;
    let slice = &rest[start..];

    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;

    for (byte_idx, ch) in slice.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if ch == '\\' && in_str {
            escape = true;
            continue;
        }
        if ch == '"' {
            in_str = !in_str;
            continue;
        }
        if !in_str {
            if ch == open {
                depth += 1;
            } else if ch == close {
                depth -= 1;
                if depth == 0 {
                    return Some(slice[..=byte_idx].to_string());
                }
            }
        }
    }
    None
}

fn parse_drupal_history(html: &str) -> (Option<String>, Option<i32>, Option<u32>) {
    let Some(json_str) = extract_json_after(html, "jQuery.extend(Drupal.settings,", '{', '}')
    else {
        return (None, None, None);
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) else {
        return (None, None, None);
    };

    let current_user = val
        .get("currentUser")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut max_rating: Option<i32> = None;
    let mut contests_count: Option<u32> = None;

    if let Some(arr) = val
        .get("date_versus_rating")
        .and_then(|d| d.get("all"))
        .and_then(|a| a.as_array())
    {
        contests_count = Some(arr.len() as u32);
        let peak = arr
            .iter()
            .filter_map(|e| {
                e.get("rating")
                    .and_then(|r| r.as_str())
                    .and_then(|s| s.parse::<i32>().ok())
            })
            .max();
        max_rating = peak;
    }

    (current_user, max_rating, contests_count)
}

fn parse_daily_heatmap(html: &str) -> HashMap<String, u32> {
    let mut map = HashMap::new();
    let Some(json_str) = extract_json_after(html, "var userDailySubmissionsStats =", '[', ']')
    else {
        return map;
    };
    let Ok(items) = serde_json::from_str::<Vec<CcDailyStat>>(&json_str) else {
        return map;
    };

    let cutoff_str = (Local::now() - Duration::days(365))
        .format("%Y-%m-%d")
        .to_string();

    for item in items {
        if item.value > 0 && item.date >= cutoff_str {
            *map.entry(item.date).or_insert(0) += item.value;
        }
    }
    map
}

pub async fn fetch_stats(
    client: &reqwest::Client,
    handle: &str,
) -> Result<PlatformStatsDto, ApiError> {
    let enc = url_encode(handle);
    let url = format!("https://www.codechef.com/users/{enc}");

    let resp = client
        .get(&url)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "en-US,en;q=0.8")
        .send()
        .await
        .map_err(|e| ApiError::from_reqwest(e, "CodeChef"))?;

    let status = resp.status().as_u16();
    if status == 404 {
        return Err(ApiError::new(
            ErrorKind::InvalidHandle,
            "Invalid username — account not found on CodeChef.",
        ));
    }
    if status == 429 {
        return Err(ApiError::new(
            ErrorKind::RateLimited,
            "CodeChef rate limit reached. Please wait a moment.",
        ));
    }
    if status == 403 || status == 503 {
        return Err(ApiError::new(
            ErrorKind::Blocked,
            "CodeChef blocked the request (Cloudflare/HTTP 403).",
        ));
    }
    if status >= 400 {
        return Err(ApiError::new(
            ErrorKind::NetworkError,
            format!("CodeChef returned HTTP {status}."),
        ));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| ApiError::from_reqwest(e, "CodeChef"))?;

    if is_cloudflare_challenge(&html) {
        return Err(ApiError::new(
            ErrorKind::Blocked,
            "CodeChef returned a Cloudflare challenge.",
        ));
    }

    let (drupal_user, max_rating, contests_count) = parse_drupal_history(&html);
    let heatmap_data = parse_daily_heatmap(&html);

    let doc = Html::parse_document(&html);

    // 1. Rating (only present for rated accounts)
    let rating = Selector::parse("div.rating-number")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .and_then(|el| el.text().collect::<String>().trim().parse::<i32>().ok());

    // 2. Stars (only present for rated accounts)
    let stars = Selector::parse("div.rating-star span")
        .ok()
        .map(|sel| doc.select(&sel).count())
        .filter(|&c| c > 0)
        .map(|c| format!("{c}★"));

    // 3. Global rank (first rank in .rating-ranks)
    let ranking = Selector::parse(".rating-ranks ul li a strong")
        .ok()
        .and_then(|sel| doc.select(&sel).next())
        .and_then(|el| el.text().collect::<String>().trim().parse::<u32>().ok());

    // 4. Total Problems Solved: N
    let mut total_solved: Option<u32> = None;
    if let Ok(sel) = Selector::parse("section.problems-solved h3, h3") {
        for el in doc.select(&sel) {
            let txt = el.text().collect::<String>();
            if let Some(idx) = txt.find("Total Problems Solved:") {
                let after = txt[idx + "Total Problems Solved:".len()..].trim();
                let num_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(n) = num_str.parse::<u32>() {
                    total_solved = Some(n);
                    break;
                }
            }
        }
    }

    // Confirm profile actually exists (CodeChef returns 200 on unknown handles)
    let profile_exists = drupal_user.is_some() || rating.is_some() || total_solved.is_some();
    if !profile_exists {
        return Err(ApiError::new(
            ErrorKind::InvalidHandle,
            "Invalid username — account not found on CodeChef.",
        ));
    }

    let note = if rating.is_none() {
        Some("Account is unrated; streaks are not exposed publicly.".to_string())
    } else {
        None
    };

    Ok(PlatformStatsDto {
        platform: "codechef".to_string(),
        username: drupal_user.unwrap_or_else(|| handle.to_string()),
        total_solved,
        easy_solved: None,
        medium_solved: None,
        hard_solved: None,
        current_streak: None, // Not exposed publicly by CodeChef
        longest_streak: None, // Not exposed publicly by CodeChef
        total_submissions: None,
        ranking,
        rating,
        max_rating,
        rank_title: stars,
        contests_count,
        heatmap_data,
        last_synced: Utc::now().to_rfc3339(),
        error: note,
    })
}

pub async fn fetch_contests(client: &reqwest::Client) -> Result<Vec<ContestDto>, ApiError> {
    let resp = client
        .get("https://www.codechef.com/api/list/contests/all")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| ApiError::from_reqwest(e, "CodeChef"))?;

    if !resp.status().is_success() {
        return Ok(Vec::new());
    }

    let parsed: CcContestsResp = resp.json().await.map_err(|e| {
        ApiError::new(
            ErrorKind::ParseError,
            format!("Invalid CodeChef contests JSON: {e}"),
        )
    })?;

    let out = parsed
        .future_contests
        .unwrap_or_default()
        .into_iter()
        .take(10)
        .map(|c| {
            let duration_mins = c
                .contest_duration
                .as_deref()
                .and_then(|s| s.trim().parse::<u32>().ok())
                .unwrap_or(120);
            let end_time = c
                .contest_end_date_iso
                .unwrap_or_else(|| c.contest_start_date_iso.clone());
            ContestDto {
                id: format!("cc-{}", c.contest_code),
                platform: "codechef".to_string(),
                name: c.contest_name,
                start_time: c.contest_start_date_iso,
                end_time,
                url: format!("https://www.codechef.com/{}", c.contest_code),
                registration_url: Some(format!("https://www.codechef.com/{}", c.contest_code)),
                registration_status: "open".to_string(),
                duration_minutes: duration_mins,
            }
        })
        .collect();

    Ok(out)
}
