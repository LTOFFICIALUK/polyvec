'use server'

import { NextResponse } from 'next/server'

// Default to VPS server if no env var is set
const WEBSOCKET_SERVER_HTTP_URL = process.env.WEBSOCKET_SERVER_HTTP_URL || 
  (process.env.WEBSOCKET_SERVER_URL 
    ? process.env.WEBSOCKET_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://')
    : 'http://206.189.70.100:8081')

// Retry configuration for reliable VPS connection
const MAX_RETRIES = 3
const REQUEST_TIMEOUT = 300000 // 5 minutes for backtests (they can take time with multiple markets)
const INITIAL_RETRY_DELAY = 1000 // 1 second

/**
 * Make a fetch request with retry logic and timeout
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        // If we get a 5xx error, retry (server error)
        if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
          const errorText = await response.text().catch(() => 'Server error')
          console.warn(`[backtest] Server error ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}): ${errorText.substring(0, 100)}`)
          
          // Exponential backoff: 1s, 2s, 4s
          const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
          const jitter = Math.random() * 500 // Add jitter to avoid thundering herd
          await new Promise(resolve => setTimeout(resolve, backoffDelay + jitter))
          
          continue // Retry
        }
        
        // Success or non-retryable error - return response
        return response
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        // Check if it's a timeout or network error
        if ((fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) && attempt < maxRetries) {
          console.warn(`[backtest] Request timeout (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`)
          const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        
        // Network errors - retry
        if ((fetchError.message?.includes('fetch') || fetchError.message?.includes('network') || fetchError.message?.includes('ECONNREFUSED')) && attempt < maxRetries) {
          console.warn(`[backtest] Network error (attempt ${attempt + 1}/${maxRetries + 1}): ${fetchError.message}`)
          const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        
        throw fetchError
      }
    } catch (error) {
      lastError = error as Error
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error
      }
      
      // Otherwise, wait and retry
      const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, backoffDelay))
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Failed to fetch after retries')
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { 
      strategyId, 
      strategy, 
      marketId, 
      startTime, 
      endTime, 
      initialBalance,
      numberOfMarkets,
      exitPrice 
    } = body

    console.log(`[backtest] Request: strategyId=${strategyId} marketId=${marketId} numberOfMarkets=${numberOfMarkets} exitPrice=${exitPrice}`)
    console.log(`[backtest] Strategy:`, JSON.stringify(strategy, null, 2))

    if (!strategyId && !strategy) {
      return NextResponse.json(
        { error: 'Missing required parameter: strategyId or strategy' },
        { status: 400 }
      )
    }

    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/backtest`
    console.log(`[backtest] Posting to: ${url}`)
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId,
        strategy,
        marketId,
        startTime,
        endTime,
        initialBalance,
        numberOfMarkets,
        exitPrice,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[backtest] ws-service error: ${response.status} - ${errorText.substring(0, 200)}`)
      console.error(`[backtest] VPS URL: ${url}`)
      
      // Provide user-friendly error messages
      let userMessage = `Backtest service error: ${response.status}`
      if (response.status === 500) {
        userMessage = 'Backtest service temporarily unavailable. The VPS may be experiencing issues or the service may have crashed. Please check VPS logs and try again.'
      } else if (response.status === 503) {
        userMessage = 'Backtest service is busy. Please try again shortly.'
      } else if (response.status === 504) {
        userMessage = 'Backtest request timed out. Please try with fewer markets or a shorter time period.'
      } else if (response.status === 404) {
        userMessage = 'Backtest endpoint not found. The VPS service may not be running or the endpoint path is incorrect.'
      }
      
      return NextResponse.json(
        { error: userMessage, details: errorText.substring(0, 500), vpsUrl: url },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[backtest] Response: success=${data.success}`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[backtest] Error:', error)
    console.error('[backtest] VPS URL attempted:', WEBSOCKET_SERVER_HTTP_URL)
    console.error('[backtest] Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    })
    
    // Provide user-friendly error messages based on error type
    let userMessage = 'Failed to run backtest'
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      userMessage = 'Backtest request timed out. The VPS may be processing a large request. Please try again or reduce the number of markets.'
    } else if (error.message?.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED') {
      userMessage = `Unable to connect to VPS at ${WEBSOCKET_SERVER_HTTP_URL}. The VPS service may not be running. Please check that the ws-service is running on the VPS and port 8081 is accessible.`
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      userMessage = `Network error connecting to VPS at ${WEBSOCKET_SERVER_HTTP_URL}. Please check your internet connection and VPS accessibility.`
    } else if (error.message) {
      userMessage = `Backtest error: ${error.message}`
    }
    
    return NextResponse.json(
      { error: userMessage, vpsUrl: WEBSOCKET_SERVER_HTTP_URL },
      { status: 500 }
    )
  }
}

// Quick profitability check
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const strategyId = searchParams.get('strategyId')
  const marketId = searchParams.get('marketId')
  const lookbackDays = searchParams.get('lookbackDays') || '7'

  if (!strategyId) {
    return NextResponse.json(
      { error: 'Missing required parameter: strategyId' },
      { status: 400 }
    )
  }

  try {
    const url = `${WEBSOCKET_SERVER_HTTP_URL}/api/backtest/quick`
    console.log(`[backtest/quick] Posting to: ${url}`)
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId,
        marketId,
        lookbackDays: parseInt(lookbackDays, 10),
      }),
    }, 2) // Quick check - fewer retries

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[backtest/quick] ws-service error: ${response.status} - ${errorText.substring(0, 200)}`)
      return NextResponse.json(
        { error: `Backtest service error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[backtest/quick] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check profitability' },
      { status: 500 }
    )
  }
}
