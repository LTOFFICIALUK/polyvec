'use server'

import { NextResponse } from 'next/server'

// Default to VPS server if no env var is set
const WEBSOCKET_SERVER_HTTP_URL = process.env.WEBSOCKET_SERVER_HTTP_URL || 
  (process.env.WEBSOCKET_SERVER_URL 
    ? process.env.WEBSOCKET_SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://')
    : 'http://206.189.70.100:8081')

/**
 * Check VPS health status
 */
export async function GET(req: Request) {
  try {
    const healthUrl = `${WEBSOCKET_SERVER_HTTP_URL}/health`
    
    // Quick health check with short timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
    
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const healthData = await response.json().catch(() => ({}))
        return NextResponse.json({
          online: true,
          url: WEBSOCKET_SERVER_HTTP_URL,
          status: response.status,
          health: healthData,
        })
      } else {
        return NextResponse.json({
          online: false,
          url: WEBSOCKET_SERVER_HTTP_URL,
          status: response.status,
          error: `VPS returned status ${response.status}`,
        }, { status: 503 })
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      return NextResponse.json({
        online: false,
        url: WEBSOCKET_SERVER_HTTP_URL,
        error: fetchError.name === 'AbortError' 
          ? 'VPS health check timed out (5 seconds)'
          : fetchError.message || 'Unable to connect to VPS',
        code: fetchError.code,
      }, { status: 503 })
    }
  } catch (error: any) {
    return NextResponse.json({
      online: false,
      url: WEBSOCKET_SERVER_HTTP_URL,
      error: error.message || 'Health check failed',
    }, { status: 500 })
  }
}
