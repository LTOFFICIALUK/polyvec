'use server'

import { NextResponse } from 'next/server'
import { getDbPool } from '@/lib/db'

interface PricePoint {
  t: number // timestamp in ms
  yb: number // yes bid (cents)
  ya: number // yes ask (cents)
  nb: number // no bid (cents)
  na: number // no ask (cents)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const marketId = searchParams.get('marketId')
  const yesTokenId = searchParams.get('yesTokenId')
  const noTokenId = searchParams.get('noTokenId')
  const startTime = searchParams.get('startTime')
  const endTime = searchParams.get('endTime')

  console.log(`[price-history] Request: marketId=${marketId} yesTokenId=${yesTokenId?.substring(0,12)}...`)

  // We need either marketId OR both tokenIds
  if (!marketId && (!yesTokenId || !noTokenId)) {
    return NextResponse.json(
      { error: 'Missing required parameters: marketId OR (yesTokenId and noTokenId)' },
      { status: 400 }
    )
  }

  try {
    const pool = getDbPool()
    
    // Query price_events table directly from database
    let query: string
    let params: any[]
    
    if (marketId) {
      // Query by marketId (most efficient)
      query = `
        SELECT market_id, event_start, event_end, yes_token_id, no_token_id, prices
        FROM price_events
        WHERE market_id = $1
        ORDER BY event_start ASC
        LIMIT 100
      `
      params = [marketId]
    } else if (yesTokenId && noTokenId) {
      // Query by tokenIds as fallback
      query = `
        SELECT market_id, event_start, event_end, yes_token_id, no_token_id, prices
        FROM price_events
        WHERE (yes_token_id = $1 OR no_token_id = $1)
          AND (yes_token_id = $2 OR no_token_id = $2)
        ORDER BY event_start DESC
        LIMIT 100
      `
      params = [yesTokenId, noTokenId]
    } else {
      return NextResponse.json(
        { error: 'Missing required parameters: marketId OR (yesTokenId and noTokenId)' },
        { status: 400 }
      )
    }
    
    const result = await pool.query(query, params)
    console.log(`[price-history] DB returned ${result.rows.length} event rows`)
    
    // Parse time filters
    const startTimeFilter = startTime ? new Date(parseInt(startTime)) : null
    const endTimeFilter = endTime ? new Date(parseInt(endTime)) : null
    
    // Flatten all price points from all matching events
    const chartData: Array<{ time: number; upPrice: number; downPrice: number }> = []
    
    for (const row of result.rows) {
      const prices = row.prices as PricePoint[]
      
      for (const p of prices) {
        // Filter by time range if specified
        if (startTimeFilter && p.t < startTimeFilter.getTime()) continue
        if (endTimeFilter && p.t > endTimeFilter.getTime()) continue
        
        // Avoid duplicates
        if (!chartData.some(d => Math.abs(d.time - p.t) < 500)) {
          chartData.push({
            time: p.t,
            upPrice: p.yb / 100, // Convert cents to decimal
            downPrice: p.nb / 100, // Convert cents to decimal
          })
        }
      }
    }
    
    // Sort by time
    chartData.sort((a, b) => a.time - b.time)
    
    console.log(`[price-history] Returning ${chartData.length} total price points`)
    
    return NextResponse.json({
      success: true,
      count: chartData.length,
      data: chartData,
    })
  } catch (error: any) {
    console.error('[price-history] Error querying database:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch price history' },
      { status: 500 }
    )
  }
}
