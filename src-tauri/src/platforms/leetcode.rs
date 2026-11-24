use chrono::{DateTime, Datelike, Local, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::net::{
    cutoff_365_days_ago_unix, local_date_from_unix, ApiError, ContestDto, ErrorKind,
    PlatformStatsDto,
};

const LC_GRAPHQL: &str = "https://leetcode.com/graphql";

const STATS_QUERY: &str = r#"
query UserStats($username: String!, $year: Int!) {
  matchedUser(username: $username) {
    username
    profile { ranking }
    submitStatsGlobal {
      acSubmissionNum {
        difficulty
        count
      }
    }
    userCalendar(year: $year) {
      streak
      totalActiveDays
      submissionCalendar
    }
  }
  userContestRanking(username: $username) {
    rating
    attendedContestsCount
    globalRanking
    topPercentage
  }
}
"#;

const PREV_CAL_QUERY: &str = r#"
query PrevCalendar($username: String!, $year: Int!) {
  matchedUser(username: $username) {
    userCalendar(year: $year) {
      submissionCalendar
    }
  }
}
"#;

const CONTESTS_QUERY: &str = r#"
query {
  topTwoContests {
    title
    titleSlug
    startTime
    duration
  }
}
"#;

#[derive(Serialize)]
struct GqlReq<'a, V> {
    query: &'a str,
    variables: V,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Deserialize)]
struct GqlEnvelope<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcStatsData {
    matched_user: Option<LcMatchedUser>,
    user_contest_ranking: Option<LcContestRanking>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcMatchedUser {
    username: String,
    profile: Option<LcProfile>,
    submit_stats_global: Option<LcSubmitStats>,
    user_calendar: Option<LcCalendar>,
}

#[derive(Deserialize)]
struct LcProfile {
    ranking: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcSubmitStats {
    ac_submission_num: Vec<LcDifficultyCount>,
}

#[derive(Deserialize)]
struct LcDifficultyCount {
    difficulty: String,
    count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcCalendar {
    streak: Option<u32>,
    #[allow(dead_code)]
    total_active_days: Option<u32>,
    submission_calendar: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcContestRanking {
    rating: Option<f64>,
    attended_contests_count: Option<u32>,
    #[allow(dead_code)]
    global_ranking: Option<u32>,
    #[allow(dead_code)]
    top_percentage: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcPrevCalData {
    matched_user: Option<LcPrevUser>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcPrevUser {
    user_calendar: Option<LcPrevCal>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcPrevCal {
    submission_calendar: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcContestsData {
    top_two_contests: Option<Vec<LcContest>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LcContest {
    title: String,
    title_slug: String,
    start_time: i64,
    duration: i64,
}

async fn lc_post<V: Serialize, T: for<'de> Deserialize<'de>>(
    client: &reqwest::Client,
    query: &str,
    variables: V,
) -> Result<T, ApiError> {
    let resp = client
        .post(LC_GRAPHQL)
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .header("Origin", "https://leetcode.com")
        .json(&GqlReq { query, variables })
        .send()
        .await
        .map_err(|e| ApiError::from_reqwest(e, "LeetCode"))?;

    let status = resp.status().as_u16();
    if status == 429 {
        return Err(ApiError::new(
            ErrorKind::RateLimited,
            "LeetCode rate limit reached. Please try again shortly.",
        ));
    }
    if status == 403 {
        return Err(ApiError::new(
            ErrorKind::Blocked,
            "LeetCode blocked the request (HTTP 403).",
        ));
    }
    if status >= 400 {
        return Err(ApiError::new(
            ErrorKind::NetworkError,
            format!("LeetCode returned HTTP {status}."),
        ));
    }

    let env: GqlEnvelope<T> = resp.json().await.map_err(|e| {
        ApiError::new(
            ErrorKind::ParseError,
            format!("Invalid LeetCode response: {e}"),
        )
    })?;

    if let Some(errors) = env.errors {
        if let Some(first) = errors.into_iter().next() {
            let lower = first.message.to_lowercase();
            if lower.contains("does not exist") || lower.contains("not found") {
                return Err(ApiError::new(
                    ErrorKind::InvalidHandle,
                    "Invalid username — account not found on LeetCode.",
                ));
            }
            return Err(ApiError::new(
                ErrorKind::ParseError,
                format!("LeetCode error: {}", first.message),
            ));
        }
    }

    env.data.ok_or_else(|| {
        ApiError::new(
            ErrorKind::ParseError,
            "LeetCode returned empty data.",
        )
    })
}

fn merge_calendar(cal_str: Option<&str>, cutoff_unix: i64, out: &mut HashMap<String, u32>) {
    let Some(s) = cal_str else { return };
    let Ok(map) = serde_json::from_str::<HashMap<String, u32>>(s) else {
        return;
    };
    for (ts_str, count) in map {
        let Ok(ts) = ts_str.parse::<i64>() else {
            continue;
        };
        if ts < cutoff_unix {
            continue;
        }
        if let Some(day) = local_date_from_unix(ts) {
            *out.entry(day).or_insert(0) += count;
        }
    }
}

pub async fn fetch_stats(
    client: &reqwest::Client,
    username: &str,
) -> Result<PlatformStatsDto, ApiError> {
    let year = Local::now().year();
    let prev_year = year - 1;

    #[derive(Serialize)]
    struct Vars<'a> {
        username: &'a str,
        year: i32,
    }

    let (main_res, prev_res) = tokio::join!(
        lc_post::<_, LcStatsData>(client, STATS_QUERY, Vars { username, year }),
        lc_post::<_, LcPrevCalData>(client, PREV_CAL_QUERY, Vars { username, year: prev_year }),
    );

    let main = main_res?;
    let user = main.matched_user.ok_or_else(|| {
        ApiError::new(
            ErrorKind::InvalidHandle,
            "Invalid username — account not found on LeetCode.",
        )
    })?;

    let mut total_solved = None;
    let mut easy_solved = None;
    let mut medium_solved = None;
    let mut hard_solved = None;
    if let Some(stats) = &user.submit_stats_global {
        for item in &stats.ac_submission_num {
            match item.difficulty.as_str() {
                "All" => total_solved = Some(item.count),
                "Easy" => easy_solved = Some(item.count),
                "Medium" => medium_solved = Some(item.count),
                "Hard" => hard_solved = Some(item.count),
                _ => {}
            }
        }
    }

    let cutoff = cutoff_365_days_ago_unix();
    let mut heatmap_data = HashMap::new();
    if let Some(cal) = &user.user_calendar {
        merge_calendar(cal.submission_calendar.as_deref(), cutoff, &mut heatmap_data);
    }
    if let Ok(prev) = prev_res {
        if let Some(pu) = prev.matched_user {
            if let Some(pc) = pu.user_calendar {
                merge_calendar(pc.submission_calendar.as_deref(), cutoff, &mut heatmap_data);
            }
        }
    }

    let ranking = user
        .profile
        .and_then(|p| p.ranking)
        .filter(|&r| r > 0 && r < 5_000_000)
        .map(|r| r as u32);

    let (rating, contests_count) = match main.user_contest_ranking {
        Some(cr) => (
            cr.rating.map(|r| r.round() as i32),
            cr.attended_contests_count,
        ),
        None => (None, None),
    };

    Ok(PlatformStatsDto {
        platform: "leetcode".to_string(),
        username: user.username,
        total_solved,
        easy_solved,
        medium_solved,
        hard_solved,
        current_streak: user.user_calendar.and_then(|c| c.streak),
        longest_streak: None, // Not exposed by LeetCode public GraphQL API
        total_submissions: None,
        ranking,
        rating,
        max_rating: None,
        rank_title: None,
        contests_count,
        heatmap_data,
        last_synced: Utc::now().to_rfc3339(),
        error: None,
    })
}

pub async fn fetch_contests(client: &reqwest::Client) -> Result<Vec<ContestDto>, ApiError> {
    #[derive(Serialize)]
    struct Empty {}

    let data: LcContestsData = lc_post(client, CONTESTS_QUERY, Empty {}).await?;
    let now = Utc::now().timestamp();
    let contests = data.top_two_contests.unwrap_or_default();

    let out = contests
        .into_iter()
        .filter(|c| c.start_time + c.duration > now)
        .filter_map(|c| {
            let start = DateTime::from_timestamp(c.start_time, 0)?;
            let end = DateTime::from_timestamp(c.start_time + c.duration, 0)?;
            Some(ContestDto {
                id: format!("lc-{}", c.title_slug),
                platform: "leetcode".to_string(),
                name: c.title,
                start_time: start.to_rfc3339(),
                end_time: end.to_rfc3339(),
                url: format!("https://leetcode.com/contest/{}", c.title_slug),
                registration_url: Some(format!("https://leetcode.com/contest/{}", c.title_slug)),
                registration_status: "open".to_string(),
                duration_minutes: (c.duration / 60).max(0) as u32,
            })
        })
        .collect();

    Ok(out)
}
