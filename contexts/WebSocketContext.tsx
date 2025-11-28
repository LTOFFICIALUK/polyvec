'use client'

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

interface WebSocketContextType {
  isConnected: boolean
  sendMessage: (message: any) => void
  subscribe: (topic: string, callback: (data: any) => void) => () => void
  subscribeMarkets: (markets: string[], callback: (data: any) => void) => () => void
  getLatestData: (topic: string) => any | null
  getMarketData: (marketId: string) => any | null
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}

interface WebSocketProviderProps {
  children: React.ReactNode
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const subscribersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map())
  const marketSubscribersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map())
  const latestDataRef = useRef<Map<string, any>>(new Map())
  const marketDataRef = useRef<Map<string, any>>(new Map())
  const messageQueueRef = useRef<any[]>([])
  const subscribedMarketsRef = useRef<Set<string>>(new Set())

  const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_SERVER_URL 
    ? `${process.env.NEXT_PUBLIC_WEBSOCKET_SERVER_URL.replace(/\/$/, '')}/ws`
    : 'ws://localhost:8081/ws'
  const MAX_RECONNECT_ATTEMPTS = 10
  const INITIAL_RECONNECT_DELAY = 1000
  const MAX_RECONNECT_DELAY = 30000

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Don't try to connect if we've exceeded max attempts
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      return
    }

    try {
      const ws = new WebSocket(WEBSOCKET_URL)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        reconnectAttempts.current = 0

        // Send any queued messages
        while (messageQueueRef.current.length > 0) {
          const message = messageQueueRef.current.shift()
          if (message) {
            ws.send(JSON.stringify(message))
          }
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Handle new protocol messages (market_snapshot, orderbook_update, trade, etc.)
          if (data.type === 'market_snapshot' && data.marketId) {
            const marketId = data.marketId
            marketDataRef.current.set(marketId, data)
            
            // Notify market subscribers
            const subscribers = marketSubscribersRef.current.get(marketId)
            if (subscribers) {
              subscribers.forEach((callback) => {
                try {
                  callback(data)
                } catch (error) {
                  console.error('Error in market subscriber callback:', error)
                }
              })
            }
          } else if (data.type === 'orderbook_update' && data.marketId) {
            const marketId = data.marketId
            marketDataRef.current.set(marketId, data)
            
            const subscribers = marketSubscribersRef.current.get(marketId)
            if (subscribers) {
              subscribers.forEach((callback) => {
                try {
                  callback(data)
                } catch (error) {
                  console.error('Error in market subscriber callback:', error)
                }
              })
            }
          } else if (data.type === 'trade' && data.marketId) {
            const marketId = data.marketId
            const existing = marketDataRef.current.get(marketId) || {}
            marketDataRef.current.set(marketId, { ...existing, lastTrade: data })
            
            const subscribers = marketSubscribersRef.current.get(marketId)
            if (subscribers) {
              subscribers.forEach((callback) => {
                try {
                  callback(data)
                } catch (error) {
                  console.error('Error in market subscriber callback:', error)
                }
              })
            }
          } else if (data.type === 'heartbeat') {
            // Handle heartbeat - no action needed
          } else if (data.type === 'pong') {
            // Handle pong for keepalive
          } else if (data.topic) {
            // Legacy topic-based messages (backward compatibility)
            latestDataRef.current.set(data.topic, data.payload || data)
            
            const subscribers = subscribersRef.current.get(data.topic)
            if (subscribers) {
              subscribers.forEach((callback) => {
                try {
                  callback(data.payload || data)
                } catch (error) {
                  console.error('Error in WebSocket subscriber callback:', error)
                }
              })
            }
          } else {
            // Generic message handling
            console.log('WebSocket message:', data)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onerror = (error) => {
        // Only log if we haven't exceeded max attempts (to reduce console noise)
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          console.warn('WebSocket connection error (will retry):', error)
        }
        setIsConnected(false)
      }

      ws.onclose = (event) => {
        // Don't log normal closures or if we've exceeded max attempts
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS && event.code !== 1000) {
          console.log('WebSocket disconnected, reconnecting...')
        }
        setIsConnected(false)
        wsRef.current = null

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current - 1),
            MAX_RECONNECT_DELAY
          )
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        }
      }
    } catch (error) {
      // Only log if we haven't exceeded max attempts
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        console.warn('Failed to create WebSocket connection (will retry):', error)
      }
      setIsConnected(false)
    }
  }, [WEBSOCKET_URL])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      // Queue message for when connection is established
      messageQueueRef.current.push(message)
      // Try to connect if not already connecting
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect()
      }
    }
  }, [connect])

  const subscribe = useCallback((topic: string, callback: (data: any) => void) => {
    // Add subscriber
    if (!subscribersRef.current.has(topic)) {
      subscribersRef.current.set(topic, new Set())
    }
    subscribersRef.current.get(topic)!.add(callback)

    // Send subscription message
    sendMessage({
      type: 'subscribe',
      topic: topic,
    })

    // Return unsubscribe function
    return () => {
      const subscribers = subscribersRef.current.get(topic)
      if (subscribers) {
        subscribers.delete(callback)
        if (subscribers.size === 0) {
          // Unsubscribe from server if no more subscribers
          sendMessage({
            type: 'unsubscribe',
            topic: topic,
          })
        }
      }
    }
  }, [sendMessage])

  const subscribeMarkets = useCallback((markets: string[], callback: (data: any) => void) => {
    // Add subscribers for each market
    for (const marketId of markets) {
      if (!marketSubscribersRef.current.has(marketId)) {
        marketSubscribersRef.current.set(marketId, new Set())
      }
      marketSubscribersRef.current.get(marketId)!.add(callback)
      
      // Track subscribed markets
      subscribedMarketsRef.current.add(marketId)
    }
    
    // Send subscription message using new protocol
    sendMessage({
      type: 'subscribe_markets',
      markets: markets,
    })
    
    // Return unsubscribe function
    return () => {
      for (const marketId of markets) {
        const subscribers = marketSubscribersRef.current.get(marketId)
        if (subscribers) {
          subscribers.delete(callback)
          if (subscribers.size === 0) {
            marketSubscribersRef.current.delete(marketId)
            subscribedMarketsRef.current.delete(marketId)
          }
        }
      }
      
      // Unsubscribe from server if no more subscribers for these markets
      const marketsToUnsubscribe = markets.filter(marketId => 
        !marketSubscribersRef.current.has(marketId) || 
        marketSubscribersRef.current.get(marketId)?.size === 0
      )
      
      if (marketsToUnsubscribe.length > 0) {
        sendMessage({
          type: 'unsubscribe_markets',
          markets: marketsToUnsubscribe,
        })
      }
    }
  }, [sendMessage])

  const getLatestData = useCallback((topic: string) => {
    return latestDataRef.current.get(topic) || null
  }, [])

  const getMarketData = useCallback((marketId: string) => {
    return marketDataRef.current.get(marketId) || null
  }, [])

  useEffect(() => {
    connect()

    // Keepalive ping
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({ type: 'ping' })
      }
    }, 30000) // Every 30 seconds

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      clearInterval(pingInterval)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, sendMessage])

  const value: WebSocketContextType = {
    isConnected,
    sendMessage,
    subscribe,
    subscribeMarkets,
    getLatestData,
    getMarketData,
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

