# ⚠️ CRITICAL: Market Selection Logic - DO NOT MODIFY

## Purpose
This document explains the critical market selection logic in `ws-service/src/index.ts` that finds the current active Polymarket event. **This code must not be modified** as it handles complex timezone and date offset issues.

**NOTE: This logic works identically for both 15m and 1h timeframes. The code is fully generic and uses `timeframeNormalized` throughout.**

## Problem Statement
Polymarket markets are labeled with dates that are 24 hours ahead of the actual trading window. For example, a market for "November 27, 2:15-2:30 PM ET" (15m) or "November 27, 2:00-3:00 PM ET" (1h) is labeled as "November 28" in the question text and slug timestamp.

## Solution Architecture

### 1. Slug Timestamp as Source of Truth
- Market slugs contain Unix timestamps: `sol-updown-15m-1764356400` or `sol-updown-1h-1764356400`
- The timestamp represents the event start time
- We use this timestamp (not question text) as the primary source of truth
- Works identically for both 15m and 1h timeframes

### 2. 24-Hour Offset Detection
- If slug timestamp is 18-26 hours in the future, it's likely labeled as tomorrow but actually for today
- We subtract 24 hours from the timestamp for comparison
- We construct an adjusted slug with today's timestamp

### 3. Market Selection Priority
1. Markets currently in their window (active)
2. Closest upcoming markets (within 6 hours)
3. Most recently ended markets (fallback only)

### 4. Adjusted Slug Construction
- When 24h offset is detected, we construct a new slug pointing to today's market
- This ensures "View on Polymarket" links point to the correct market
- Format: `{pair}-updown-{timeframe}-{adjusted_timestamp}`

## Critical Code Sections

### Section 1: `marketsWithWindows` mapping (lines ~548-620)
- Extracts slug timestamps
- Detects 24h offset (18-26 hours away)
- Adjusts timestamps and constructs adjusted slugs
- **DO NOT MODIFY** the offset detection logic (18-26 hour window)

### Section 2: `parseEventTime` function (lines ~413-542)
- Parses question text as fallback when slug unavailable
- Tries multiple date options: original, -24h, today
- **DO NOT MODIFY** the date parsing or fallback logic

### Section 3: Market selection priority (lines ~622-656)
- Selects markets in priority: active > upcoming > ended
- **DO NOT MODIFY** the selection order or fallback logic

### Section 4: `ensureMarketMetadataForPair` function (lines ~876+)
- Fetches current market from Polymarket API
- Constructs slugs for current time window
- **DO NOT MODIFY** the slug construction or fetch logic

### Section 5: Adjusted slug return (lines ~786+)
- Returns `selectedMarketWindow?.adjustedSlug` if available
- **DO NOT MODIFY** the slug selection logic

## Why This Logic Exists

1. **Polymarket API Behavior**: Markets are labeled 24 hours ahead
2. **Timezone Complexity**: ET timezone with DST changes
3. **Slug Timestamp Accuracy**: Slugs contain precise Unix timestamps
4. **User Experience**: Users need correct "View on Polymarket" links

## Consequences of Modification

- **Changing offset detection window**: Will miss markets or select wrong ones
- **Modifying selection priority**: Will show wrong markets to users
- **Removing adjusted slug logic**: "View on Polymarket" links will point to tomorrow's markets
- **Changing date parsing**: Will break market time detection

## Testing Requirements

If you must modify this code (NOT RECOMMENDED), verify:
1. Current market is found correctly (not 24h ahead) for BOTH 15m and 1h
2. "View on Polymarket" links point to today's market for BOTH timeframes
3. Market selection works for all pairs (BTC, SOL, ETH, XRP)
4. Market selection works for all timeframes (15m, 1h) - **CRITICAL: Logic must work identically for both**
5. Markets transition correctly when windows end (both 15m and 1h windows)
6. Slug timestamp adjustment works for both timeframe formats

## AI Assistant Instructions

**DO NOT:**
- Modify the 24h offset detection logic (18-26 hour window)
- Change the market selection priority order
- Remove the adjusted slug construction
- Modify the `parseEventTime` function's date parsing
- Change how `ensureMarketMetadataForPair` constructs slugs

**IF USER ASKS TO MODIFY:**
- Explain why this code is critical
- Suggest alternative approaches that don't touch this logic
- Point to this document for full context

## Related Files
- `ws-service/src/index.ts` - Main market selection logic
- `ws-service/src/polymarket/clobClient.ts` - Market fetching from API

