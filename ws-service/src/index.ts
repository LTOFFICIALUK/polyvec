/**
 * WebSocket service entry point
 * Main server that coordinates Polymarket connector, state store, and WebSocket server
 */

import http from 'http'
import { WebSocketServer } from './ws/server'
import { MarketsStateStore } from './state/marketsState'
import { fetchMarketsList, fetchOrderbook, fetchMultipleOrderbooks, fetchMarketBySlug, MarketMetadata } from './polymarket/clobClient'

const POLYMARKET_GAMMA_API = process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : 8081

const PAIR_SLUG_MAP: Record<string, string> = {
  BTC: 'btc',
  SOL: 'sol',
  ETH: 'eth',
  XRP: 'xrp',
}

// Full pair names for hourly markets (they use "solana" not "sol" in slugs)
const PAIR_FULL_NAME_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  SOL: 'solana',
  ETH: 'ethereum',
  XRP: 'xrp',
}

const TIMEFRAME_CONFIG: Record<string, { minutes: number; slug: string }> = {
  '15m': { minutes: 15, slug: '15m' },
  '1h': { minutes: 60, slug: '1h' },
  'hourly': { minutes: 60, slug: 'hourly' }, // Support "hourly" as alternative to "1h"
}

const LAST_SLUG_FETCH: Record<string, number> = {}

const formatEtDateParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(date)
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  // Normalize offset into a valid ISO offset string like "-05:00" or "-04:00"
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-05:00'
  let offsetRaw = tzName.replace('GMT', '')
  // Handle values like "-5" or "-04:00"
  if (!offsetRaw.includes(':')) {
    const sign = offsetRaw.startsWith('-') ? '-' : '+'
    const num = Math.abs(parseInt(offsetRaw || '5', 10)) || 5
    offsetRaw = `${sign}${num.toString().padStart(2, '0')}:00`
  }
  const offset = offsetRaw
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    offset,
  }
}

const getEventWindowStart = (timeframeMinutes: number): number => {
  const now = new Date()
  const { year, month, day, hour, minute, offset } = formatEtDateParts(now)
  const minuteNum = parseInt(minute, 10)
  const flooredMinutes = Math.floor(minuteNum / timeframeMinutes) * timeframeMinutes
  const iso = `${year}-${month}-${day}T${hour}:${flooredMinutes.toString().padStart(2, '0')}:00${offset}`
  return new Date(iso).getTime()
}

const generateSlug = (pair: string, timeframe: string, eventStartSeconds: number) => {
  const pairSlug = PAIR_SLUG_MAP[pair.toUpperCase()]
  const timeframeSlug = TIMEFRAME_CONFIG[timeframe.toLowerCase()]?.slug
  if (!pairSlug || !timeframeSlug) return null
  
  // Hourly markets use a different format: "solana-up-or-down-november-27-2pm-et"
  if (timeframe.toLowerCase() === '1h' || timeframe.toLowerCase() === 'hourly') {
    const pairFullName = PAIR_FULL_NAME_MAP[pair.toUpperCase()]
    if (!pairFullName) return null
    
    try {
      // Convert timestamp to ET date/time
      const eventDate = new Date(eventStartSeconds * 1000)
      if (isNaN(eventDate.getTime())) return null // Invalid date
      
      const etDate = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        hour12: true,
      }).formatToParts(eventDate)
      
      const month = etDate.find(p => p.type === 'month')?.value.toLowerCase() || ''
      const day = etDate.find(p => p.type === 'day')?.value || ''
      const hour = etDate.find(p => p.type === 'hour')?.value || ''
      const dayPeriod = etDate.find(p => p.type === 'dayPeriod')?.value?.toLowerCase() || ''
      
      if (!month || !day || !hour || !dayPeriod) return null
      
      // Format: "november-27-2pm" (no minutes for hourly)
      const timeStr = `${hour}${dayPeriod}`
      return `${pairFullName}-up-or-down-${month}-${day}-${timeStr}-et`
    } catch (error) {
      return null
    }
  }
  
  // 15m markets use timestamp format
  return `${pairSlug}-updown-${timeframeSlug}-${eventStartSeconds}`
}

// Create HTTP server
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const path = url.pathname

  // Health endpoint
  if (path === '/health') {
    const health = wsServer.getHealthStatus()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(health))
    return
  }

  // Debug endpoint - returns all matching markets with full details
  if (path === '/markets/debug' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const { pair, timeframe } = JSON.parse(body)
        const stateStore = wsServer.getStateStore()
        const now = Date.now()
        
        // Get all markets
        const allMarkets = stateStore.getAllMarkets()
        
        // Parse event time helper (same as in /markets/current)
        const parseEventTime = (question: string): { eventStart: number | null; eventEnd: number | null } => {
          try {
            const datePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
            const dateMatch = question.match(datePattern)
            
            const timePattern = /(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)\s+ET/i
            const match = question.match(timePattern)
            if (!match) return { eventStart: null, eventEnd: null }
            
            const nowInET = new Date()
            const etFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
            
            const etParts = etFormatter.formatToParts(nowInET)
            const todayYear = parseInt(etParts.find(p => p.type === 'year')?.value || '2025')
            const todayMonth = parseInt(etParts.find(p => p.type === 'month')?.value || '11')
            const todayDay = parseInt(etParts.find(p => p.type === 'day')?.value || '27')
            
            let etYear: number, etMonth: number, etDay: number
            if (dateMatch) {
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
              const monthName = dateMatch[1].toLowerCase()
              etMonth = monthNames.indexOf(monthName) + 1
              etDay = parseInt(dateMatch[2])
              etYear = todayYear
              
              if (etMonth < todayMonth || (etMonth === todayMonth && etDay < todayDay)) {
                etYear += 1
              }
            } else {
              etYear = todayYear
              etMonth = todayMonth
              etDay = todayDay
            }
            
            const parsedDateIsFuture = etYear > todayYear || 
                                      (etYear === todayYear && etMonth > todayMonth) ||
                                      (etYear === todayYear && etMonth === todayMonth && etDay > todayDay)
            
            const datesToTry: Array<{year: number, month: number, day: number}> = []
            if (parsedDateIsFuture) {
              datesToTry.push({ year: todayYear, month: todayMonth, day: todayDay })
              datesToTry.push({ year: etYear, month: etMonth, day: etDay })
            } else {
              datesToTry.push({ year: etYear, month: etMonth, day: etDay })
            }
            
            let startHour = parseInt(match[1])
            const startMin = parseInt(match[2])
            const startPeriod = match[3].toUpperCase()
            if (startPeriod === 'PM' && startHour !== 12) startHour += 12
            if (startPeriod === 'AM' && startHour === 12) startHour = 0
            
            let endHour = parseInt(match[4])
            const endMin = parseInt(match[5])
            const endPeriod = match[6].toUpperCase()
            if (endPeriod === 'PM' && endHour !== 12) endHour += 12
            if (endPeriod === 'AM' && endHour === 12) endHour = 0
            
            const createETTimestamp = (year: number, month: number, day: number, hour: number, minute: number): number => {
              const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
              const offset = (month >= 11 || month <= 2) ? '-05:00' : '-04:00'
              const dateWithOffset = new Date(`${dateStr}${offset}`)
              const etTime = dateWithOffset.toLocaleString('en-US', { 
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
              const expectedHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour)
              const expectedPeriod = hour >= 12 ? 'PM' : 'AM'
              const actualPeriod = etTime.includes('PM') ? 'PM' : 'AM'
              const actualHour = parseInt(etTime.split(':')[0])
              
              if (actualHour !== expectedHour || actualPeriod !== expectedPeriod) {
                const otherOffset = offset === '-05:00' ? '-04:00' : '-05:00'
                const dateWithOtherOffset = new Date(`${dateStr}${otherOffset}`)
                const etTimeOther = dateWithOtherOffset.toLocaleString('en-US', { 
                  timeZone: 'America/New_York',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })
                const otherPeriod = etTimeOther.includes('PM') ? 'PM' : 'AM'
                const otherHour = parseInt(etTimeOther.split(':')[0])
                
                if (otherHour === expectedHour && otherPeriod === expectedPeriod) {
                  return dateWithOtherOffset.getTime()
                }
              }
              
              return dateWithOffset.getTime()
            }
            
            const currentTime = Date.now()
            let bestMatch: { eventStart: number, eventEnd: number } | null = null
            
            for (const dateToTry of datesToTry) {
              const candidateStart = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, startHour, startMin)
              let candidateEnd = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, endHour, endMin)
              
              if (candidateEnd < candidateStart) {
                const nextDay = new Date(candidateEnd)
                nextDay.setDate(nextDay.getDate() + 1)
                candidateEnd = nextDay.getTime()
              }
              
              const isActive = currentTime >= candidateStart && currentTime < candidateEnd
              
              if (isActive) {
                return { eventStart: candidateStart, eventEnd: candidateEnd }
              }
              
              if (!bestMatch || (candidateStart < bestMatch.eventStart && candidateStart > currentTime)) {
                bestMatch = { eventStart: candidateStart, eventEnd: candidateEnd }
              }
            }
            
            if (bestMatch) {
              return bestMatch
            }
            
            const fallbackDate = datesToTry[0]
            const eventStart = createETTimestamp(fallbackDate.year, fallbackDate.month, fallbackDate.day, startHour, startMin)
            let eventEnd = createETTimestamp(fallbackDate.year, fallbackDate.month, fallbackDate.day, endHour, endMin)
            
            if (eventEnd < eventStart) {
              const nextDay = new Date(eventEnd)
              nextDay.setDate(nextDay.getDate() + 1)
              eventEnd = nextDay.getTime()
            }
            
            return { eventStart, eventEnd }
          } catch (error) {
            return { eventStart: null, eventEnd: null }
          }
        }
        
        // Filter to markets that match the pair and timeframe
        const matchingMarkets = allMarkets.filter((state) => {
          const metadata = state.metadata
          if (!metadata) return false
          
          const question = (metadata.question || '').toUpperCase()
          const pairUpper = (pair || '').toUpperCase()
          
          const pairMap: Record<string, string[]> = {
            'BTC': ['BITCOIN', 'BTC'],
            'SOL': ['SOLANA', 'SOL'],
            'ETH': ['ETHEREUM', 'ETH'],
            'XRP': ['XRP', 'RIPPLE'],
          }
          
          const pairVariants = pairMap[pairUpper] || [pairUpper]
          const hasPair = pairVariants.some(variant => question.includes(variant))
          
          const hasTimeframe = !timeframe || 
                              metadata.eventTimeframe === timeframe ||
                              metadata.eventTimeframe === timeframe.toUpperCase() ||
                              metadata.eventTimeframe === timeframe.toLowerCase()
          
          return hasPair && hasTimeframe
        })
        
        // Build detailed response for each matching market
        // Show ALL markets (including settled ones) for debugging
        const debugMarkets = matchingMarkets
          .map((state) => {
            const metadata = state.metadata
            if (!metadata) return null
            
            const { eventStart, eventEnd } = parseEventTime(metadata.question || '')
            
            const bid = state.bestBid
            const ask = state.bestAsk
            const isSettled = bid !== null && ask !== null && ((bid <= 0.02 && ask >= 0.98) || (bid >= 0.98 && ask <= 0.02))
            const isInWindow = eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : false
            const justEnded = eventStart && eventEnd ? (now >= eventEnd && now < eventEnd + (10 * 60 * 1000)) : false
            const aboutToStart = eventStart && eventEnd ? (eventStart > now && eventStart <= now + (30 * 60 * 1000)) : false
            const isInActiveRange = bid !== null && ask !== null && (bid >= 0.10 && bid <= 0.90) && (ask >= 0.10 && ask <= 0.90)
            
            const timeUntilStart = eventStart ? ((eventStart - now) / 1000 / 60) : null
            const timeUntilEnd = eventEnd ? ((eventEnd - now) / 1000 / 60) : null
            const timeSinceEnd = eventEnd ? ((now - eventEnd) / 1000 / 60) : null
            
            // Calculate distance from current time for sorting
            // Use eventStart if available, otherwise use metadata startTime
            const referenceTime = eventStart || metadata.startTime || 0
            const timeDistance = Math.abs(referenceTime - now)
            
            return {
              marketId: state.marketId,
              question: metadata.question,
              tokenId: metadata.yesTokenId || metadata.tokenId,
              yesTokenId: metadata.yesTokenId || metadata.tokenId,
              noTokenId: metadata.noTokenId || metadata.tokenIds?.[1],
              eventTimeframe: metadata.eventTimeframe,
              bestBid: bid,
              bestAsk: ask,
              lastPrice: state.lastPrice,
              metadataStartTime: metadata.startTime,
              metadataEndTime: metadata.endTime,
              parsedEventStart: eventStart,
              parsedEventEnd: eventEnd,
              parsedEventStartET: eventStart ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              parsedEventEndET: eventEnd ? new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              isInWindow,
              justEnded,
              aboutToStart,
              isInActiveRange,
              isSettled,
              timeUntilStartMinutes: timeUntilStart,
              timeUntilEndMinutes: timeUntilEnd,
              timeSinceEndMinutes: timeSinceEnd,
              bidCents: bid !== null ? (bid * 100).toFixed(1) : null,
              askCents: ask !== null ? (ask * 100).toFixed(1) : null,
              _timeDistance: timeDistance, // For sorting, will be removed before returning
            }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
        
        // Sort by proximity to current time (closest first)
        debugMarkets.sort((a, b) => {
          return a._timeDistance - b._timeDistance
        })
        
        // Return ALL markets (no limit)
        const limitedMarkets = debugMarkets.map(({ _timeDistance, ...rest }) => rest)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          pair,
          timeframe,
          currentTime: new Date(now).toISOString(),
          currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          totalMatching: matchingMarkets.length,
          marketsReturned: limitedMarkets.length,
          markets: limitedMarkets,
        }, null, 2))
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message || 'Invalid request' }))
      }
    })
    return
  }

  // Current markets endpoint
  if (path === '/markets/current' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', async () => {
      try {
        const { pair, timeframe } = JSON.parse(body)
        const pairUpper = (pair || '').toUpperCase()
        const timeframeNormalized = timeframe ? timeframe.toLowerCase() : undefined

        await ensureMarketMetadataForPair(pairUpper, timeframeNormalized)

        const stateStore = wsServer.getStateStore()
        const now = Date.now()
        
        // Get all markets
        let allMarkets = stateStore.getAllMarkets()
        
        const filterByPairAndTimeframe = (state: ReturnType<typeof stateStore.getAllMarkets>[number]) => {
          const metadata = state.metadata
          if (!metadata) return false
          
          // Check if market matches pair - look for BTC, SOL, ETH, XRP in question
          const question = (metadata.question || '').toUpperCase()
          
          // Map pair codes to full names
          const pairMap: Record<string, string[]> = {
            'BTC': ['BITCOIN', 'BTC'],
            'SOL': ['SOLANA', 'SOL'],
            'ETH': ['ETHEREUM', 'ETH'],
            'XRP': ['XRP', 'RIPPLE'],
          }
          const pairVariants = pairUpper ? (pairMap[pairUpper] || [pairUpper]) : []
          const hasPair = pairVariants.length === 0 || pairVariants.some(variant => question.includes(variant))
          
          // Check timeframe - match 15m or 1h (also handle "hourly" as 1h)
          let marketTimeframe = metadata.eventTimeframe?.toLowerCase() || ''
          // Also check slug for timeframe indicator
          if (!marketTimeframe && metadata.slug) {
            // Hourly markets use format: "solana-up-or-down-november-27-2pm-et"
            if (metadata.slug.includes('-up-or-down-') && metadata.slug.endsWith('-et')) {
              marketTimeframe = '1h'
            } else if (metadata.slug.includes('-1h-') || metadata.slug.includes('-hourly-')) {
              marketTimeframe = '1h'
            } else if (metadata.slug.includes('-15m-')) {
              marketTimeframe = '15m'
            }
          }
          // Normalize "hourly" to "1h"
          if (marketTimeframe === 'hourly') {
            marketTimeframe = '1h'
          }
          const hasTimeframe = !timeframeNormalized || marketTimeframe === timeframeNormalized
          
          return hasPair && hasTimeframe
        }

        let matchingMarkets = allMarkets.filter(filterByPairAndTimeframe)
        
        // Always try to ensure we have the current market, even if we have other markets
        // This ensures we fetch the market for the current time slot
        if (pairUpper && timeframeNormalized) {
          await ensureMarketMetadataForPair(pairUpper, timeframeNormalized)
          allMarkets = stateStore.getAllMarkets()
          matchingMarkets = allMarkets.filter(filterByPairAndTimeframe)
        }
        
        // ⚠️⚠️⚠️ CRITICAL: parseEventTime function - DO NOT MODIFY ⚠️⚠️⚠️
        // This function parses event times from question text and handles 24h offset detection
        // It tries multiple date options (original, -24h, today) to find the correct market
        // Modifying this will break market time detection
        // See: ws-service/MARKET_SELECTION_CRITICAL.md
        // Parse the actual event time from the question (e.g., "November 27, 10:15AM-10:30AM ET")
        // This is the actual trading window (15m or 1h), not the full market window
        const parseEventTime = (metadata: any): { eventStart: number | null; eventEnd: number | null } => {
          try {
            const question: string = metadata?.question || ''
            // Pattern: "November 27, 10:15AM-10:30AM ET" or "10:15AM-10:30AM ET"
            // First try to extract date if present
            const datePattern = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i
            const dateMatch = question.match(datePattern)
            
            const timePattern = /(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)\s+ET/i
            const match = question.match(timePattern)
            if (!match) return { eventStart: null, eventEnd: null }
            
            // Get current date components in ET timezone
            const nowDate = new Date()
            const etFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
            
            // Get today's date in ET
            const etParts = etFormatter.formatToParts(nowDate)
            const todayYear = parseInt(etParts.find(p => p.type === 'year')?.value || '2025')
            const todayMonth = parseInt(etParts.find(p => p.type === 'month')?.value || '11')
            const todayDay = parseInt(etParts.find(p => p.type === 'day')?.value || '27')
            
            // Parse date from question if present
            let etYear: number, etMonth: number, etDay: number
            if (dateMatch) {
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
              const monthName = dateMatch[1].toLowerCase()
              etMonth = monthNames.indexOf(monthName) + 1
              etDay = parseInt(dateMatch[2])
              etYear = todayYear
              
              // If the parsed month/day is in the past compared to today, assume it's next year
              if (etMonth < todayMonth || (etMonth === todayMonth && etDay < todayDay)) {
                etYear += 1
              }
            } else {
              // No date in question, use today
              etYear = todayYear
              etMonth = todayMonth
              etDay = todayDay
            }
            
            // Try multiple date options:
            // 1. The parsed date as-is (in case it's actually correct)
            // 2. The parsed date -24h (in case we're 24h ahead)
            // 3. Today as a fallback
            const datesToTry: Array<{year: number, month: number, day: number}> = []
            
            // Add parsed date as-is
            datesToTry.push({ year: etYear, month: etMonth, day: etDay })
            
            // Add parsed date -24h
            const parsedDate = new Date(etYear, etMonth - 1, etDay)
            parsedDate.setDate(parsedDate.getDate() - 1)
            datesToTry.push({ 
              year: parsedDate.getFullYear(), 
              month: parsedDate.getMonth() + 1, 
              day: parsedDate.getDate() 
            })
            
            // Add today as fallback
            datesToTry.push({ year: todayYear, month: todayMonth, day: todayDay })
            // Remove duplicates
            const uniqueDates = datesToTry.filter((date, index, self) => 
              index === self.findIndex(d => d.year === date.year && d.month === date.month && d.day === date.day)
            )
            
            // Parse start time
            let startHour = parseInt(match[1])
            const startMin = parseInt(match[2])
            const startPeriod = match[3].toUpperCase()
            if (startPeriod === 'PM' && startHour !== 12) startHour += 12
            if (startPeriod === 'AM' && startHour === 12) startHour = 0
            
            // Parse end time
            let endHour = parseInt(match[4])
            const endMin = parseInt(match[5])
            const endPeriod = match[6].toUpperCase()
            if (endPeriod === 'PM' && endHour !== 12) endHour += 12
            if (endPeriod === 'AM' && endHour === 12) endHour = 0
            
            // Create ET-based timestamps by attaching a fixed offset and then
            // letting JS normalize. This is approximate but consistent with our
            // earlier behavior.
            const createETTimestamp = (year: number, month: number, day: number, hour: number, minute: number): number => {
              const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`
              const offset = (month >= 11 || month <= 2) ? '-05:00' : '-04:00'
              const dateWithOffset = new Date(`${dateStr}${offset}`)
              return dateWithOffset.getTime()
            }
            
            const currentTime = Date.now()
            let bestMatch: { eventStart: number, eventEnd: number } | null = null
            
            for (const dateToTry of uniqueDates) {
              const candidateStart = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, startHour, startMin)
              let candidateEnd = createETTimestamp(dateToTry.year, dateToTry.month, dateToTry.day, endHour, endMin)
              
              // If end time is before start time, it's the next day
              if (candidateEnd < candidateStart) {
                const nextDay = new Date(candidateEnd)
                nextDay.setDate(nextDay.getDate() + 1)
                candidateEnd = nextDay.getTime()
              }
              
              const isActive = currentTime >= candidateStart && currentTime < candidateEnd
              
              if (isActive) {
                return { eventStart: candidateStart, eventEnd: candidateEnd }
              }
              
              if (!bestMatch || Math.abs(candidateStart - currentTime) < Math.abs(bestMatch.eventStart - currentTime)) {
                bestMatch = { eventStart: candidateStart, eventEnd: candidateEnd }
              }
            }
            
            if (bestMatch) {
              return bestMatch
            }
            
            return { eventStart: null, eventEnd: null }
          } catch (error) {
            return { eventStart: null, eventEnd: null }
          }
        }
        
        // ⚠️⚠️⚠️ CRITICAL MARKET SELECTION LOGIC - DO NOT MODIFY ⚠️⚠️⚠️
        // This section finds the current active market by:
        // 1. Using eventStartTime from API as primary source (most reliable)
        // 2. Falling back to slug timestamp parsing if eventStartTime not available
        // 3. Detecting 24h offset and adjusting timestamps
        // 4. Constructing adjusted slugs to point to today's markets
        // ANY CHANGES TO THIS LOGIC WILL BREAK MARKET DETECTION
        // See: ws-service/MARKET_SELECTION_CRITICAL.md for full explanation
        // Slug format: "sol-updown-15m-1764355500" or "sol-updown-1h-1764355500" where last number is Unix timestamp in seconds
        const marketsWithWindows = matchingMarkets
          .map(state => {
            const metadata = state.metadata
            if (!metadata) return null
            
            // First priority: Use eventStartTime from API if available (most reliable)
            let eventStart: number | null = null
            let eventEnd: number | null = null
            let adjustedSlug: string | null = null // Store adjusted slug if we detect 24h offset
            
            if (metadata.eventStartTime && metadata.eventEndTime) {
              // Use API-provided event times
              let eventStartMs = metadata.eventStartTime
              let eventEndMs = metadata.eventEndTime
              
              if (timeframeNormalized !== '15m') {
                // For non-15m markets, detect 24h offset and filter out far-away events
                let hoursFromNow = (eventStartMs - now) / (1000 * 60 * 60)
                if (hoursFromNow > 18 && hoursFromNow < 26) {
                  // Likely 24h offset - subtract 24 hours
                  eventStartMs = eventStartMs - (24 * 60 * 60 * 1000)
                  eventEndMs = eventEndMs - (24 * 60 * 60 * 1000)
                  hoursFromNow = (eventStartMs - now) / (1000 * 60 * 60)
                }
                
                // Check if within reasonable window (-6 to +6 hours)
                if (Math.abs(hoursFromNow) > 6) {
                  // Event time is too far away, skip this market
                  return null
                }
              }
              
              eventStart = eventStartMs
              eventEnd = eventEndMs
            } else if (metadata.slug) {
              // Fallback to slug parsing if eventStartTime not available
              // Handle hourly market slug format: "solana-up-or-down-november-27-2pm-et"
              if (metadata.slug.includes('-up-or-down-') && metadata.slug.endsWith('-et')) {
                try {
                  // Parse format: "solana-up-or-down-november-27-2pm-et"
                  const parts = metadata.slug.split('-up-or-down-')
                  if (parts.length === 2) {
                    const dateTimePart = parts[1].replace(/-et$/, '') // "november-27-2pm"
                    const dateTimeMatch = dateTimePart.match(/^([a-z]+)-(\d+)-(\d+)(am|pm)$/i)
                    if (dateTimeMatch) {
                      const monthName = dateTimeMatch[1]
                      const day = parseInt(dateTimeMatch[2], 10)
                      let hour = parseInt(dateTimeMatch[3], 10)
                      const period = dateTimeMatch[4].toLowerCase()
                      
                      // Convert to 24-hour format
                      if (period === 'pm' && hour !== 12) hour += 12
                      if (period === 'am' && hour === 12) hour = 0
                      
                      // Get current year
                      const nowDate = new Date()
                      const etFormatter = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/New_York',
                        year: 'numeric',
                      })
                      const year = parseInt(etFormatter.format(nowDate), 10)
                      
                      // Convert month name to number
                      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                         'july', 'august', 'september', 'october', 'november', 'december']
                      const month = monthNames.indexOf(monthName.toLowerCase()) + 1
                      
                      if (month > 0 && day > 0 && day <= 31 && hour >= 0 && hour <= 23) {
                        // Create ET timestamp for the start of the hour
                        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:00:00`
                        const offset = (month >= 11 || month <= 2) ? '-05:00' : '-04:00'
                        const eventDate = new Date(`${dateStr}${offset}`)
                        const eventStartMs = eventDate.getTime()
                        
                        // Validate the date is valid
                        if (!isNaN(eventStartMs)) {
                          const eventEndMs = eventStartMs + (60 * 60 * 1000) // 1 hour
                          
                          // Check if within reasonable window (-6 to +6 hours)
                          const hoursFromNow = (eventStartMs - now) / (1000 * 60 * 60)
                          if (Math.abs(hoursFromNow) <= 6) {
                            eventStart = eventStartMs
                            eventEnd = eventEndMs
                          }
                        }
                      }
                    }
                  }
                } catch (error) {
                  // Fall through to timestamp parsing
                }
              }
              
              // Handle timestamp-based slug format: "sol-updown-15m-1764355500" or "sol-updown-1h-1764355500"
              if (!eventStart && !eventEnd) {
                const slugMatch = metadata.slug.match(/-(\d+)$/)
                if (slugMatch) {
                  const slugTimestampSeconds = parseInt(slugMatch[1], 10)
                  if (!Number.isNaN(slugTimestampSeconds)) {
                    let slugTimestampMs = slugTimestampSeconds * 1000
                    
                    // Check if slug timestamp is within reasonable window
                    let hoursFromNow = (slugTimestampMs - now) / (1000 * 60 * 60)
                    let wasAdjusted = false
                    
                    // For 15m markets: if timestamp is 18-26 hours away, it's definitely tomorrow's market - skip it
                    // For 1h markets: try adjusting 24h offset
                    if (timeframeNormalized === '15m' && hoursFromNow > 18 && hoursFromNow < 26) {
                      // This is tomorrow's 15m market - skip it entirely
                      return null
                    }
                    
                    // For 1h markets, try adjusting 24h offset
                    if (timeframeNormalized === '1h' && hoursFromNow > 18 && hoursFromNow < 26) {
                      // Likely 24h offset - subtract 24 hours and check if that brings it close to now
                      slugTimestampMs = slugTimestampMs - (24 * 60 * 60 * 1000)
                      hoursFromNow = (slugTimestampMs - now) / (1000 * 60 * 60)
                      wasAdjusted = true
                    }
                    
                    // For 15m markets, be stricter: only accept if within current window or very recent past/future
                    // This prevents selecting tomorrow's markets
                    const maxHoursAway = timeframeNormalized === '15m' ? 2 : 6 // 15m: 2 hours, 1h: 6 hours
                    
                    // Only use if within reasonable window
                    if (Math.abs(hoursFromNow) <= maxHoursAway) {
                      eventStart = slugTimestampMs
                      const timeframeMinutes = timeframeNormalized === '1h' ? 60 : 15
                      eventEnd = eventStart + (timeframeMinutes * 60 * 1000)
                      
                      // If we adjusted the timestamp, construct today's slug
                      if (wasAdjusted && metadata.slug) {
                        const slugBase = metadata.slug.replace(/-\d+$/, '')
                        const adjustedTimestampSeconds = Math.floor(slugTimestampMs / 1000)
                        adjustedSlug = `${slugBase}-${adjustedTimestampSeconds}`
                      }
                    } else {
                      // Slug timestamp is too far away, skip this market
                      return null
                    }
                  }
                }
              }
            }
            
            // Fallback to parsing question text if slug doesn't have timestamp
            if (!eventStart || !eventEnd) {
              const parsed = parseEventTime(metadata)
              eventStart = parsed.eventStart
              eventEnd = parsed.eventEnd
            }
            
            if (!eventStart || !eventEnd) return null
            
            const isInWindow = now >= eventStart && now < eventEnd
            const timeUntilStart = eventStart - now
            const timeUntilEnd = eventEnd - now
            
            return {
              state,
              eventStart,
              eventEnd,
              isInWindow,
              timeUntilStart,
              timeUntilEnd,
              adjustedSlug, // Slug adjusted for today if we detected 24h offset
            }
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
        
        // ⚠️⚠️⚠️ CRITICAL: Market selection priority logic - DO NOT MODIFY ⚠️⚠️⚠️
        // This logic selects markets in priority order:
        // 1. Markets currently in their window (active) - ONLY THESE
        // 2. Closest upcoming markets
        // 3. Most recently ended markets (fallback)
        // Changing this order will cause incorrect market selection
        // See: ws-service/MARKET_SELECTION_CRITICAL.md
        let currentMarket: typeof matchingMarkets[0] | null = null
        let selectedMarketWindow: typeof marketsWithWindows[0] | null = null // Track selected market window data
        
        // Select markets that are currently in their window (active RIGHT NOW)
        // OR markets that just ended (within 15 minutes) - for 15m markets, this handles the case
        // where the market just ended but we're still in the same 15-minute period
        // Filter out future markets (eventStart > now) to ensure we only select markets that have actually started
        const inWindowMarkets = marketsWithWindows.filter(m => m.isInWindow && m.eventStart <= now)
        const justEndedMarkets = marketsWithWindows.filter(m => {
          if (m.isInWindow) return false // Already in window
          // Market ended within the last 15 minutes
          const timeSinceEnd = now - m.eventEnd
          return timeSinceEnd >= 0 && timeSinceEnd <= 15 * 60 * 1000
        })
        
        if (inWindowMarkets.length > 0) {
          // If multiple markets are in window, pick the one that started most recently
          inWindowMarkets.sort((a, b) => b.eventStart - a.eventStart)
          selectedMarketWindow = inWindowMarkets[0]
          currentMarket = inWindowMarkets[0].state
          console.log(`[Server] Found market in window: ${currentMarket.metadata?.question?.substring(0, 60)}...`)
        } else if (justEndedMarkets.length > 0) {
          // Use the most recently ended market (within grace period)
          justEndedMarkets.sort((a, b) => b.eventEnd - a.eventEnd)
          selectedMarketWindow = justEndedMarkets[0]
          currentMarket = justEndedMarkets[0].state
          console.log(`[Server] Found recently ended market: ${currentMarket.metadata?.question?.substring(0, 60)}...`)
        } else {
          // No market currently in window or recently ended - return null
          console.log(`[Server] No market currently in window or recently ended for ${pair} ${timeframe}`)
          currentMarket = null
        }
        
        // Debug logging
        console.log(`[Server] Current market request: pair=${pair}, timeframe=${timeframe}`)
        console.log(`[Server] Total markets: ${allMarkets.length}, Matching: ${matchingMarkets.length}, Markets with valid windows: ${marketsWithWindows.length}`)
        
        if (!currentMarket) {
          if (matchingMarkets.length > 0) {
            console.log(`[Server] Found ${matchingMarkets.length} matching markets for ${pair} ${timeframe}, but couldn't determine current market`)
            const sample = matchingMarkets[0]
            if (sample.metadata) {
              const { eventStart, eventEnd } = parseEventTime(sample.metadata)
              const startDate = eventStart ? new Date(eventStart).toISOString() : 'N/A'
              const endDate = eventEnd ? new Date(eventEnd).toISOString() : 'N/A'
              const nowDate = new Date(now).toISOString()
              console.log(`[Server] Sample market: ${sample.metadata.question}`)
              console.log(`[Server]   Start: ${startDate}, End: ${endDate}, Now: ${nowDate}`)
              console.log(`[Server]   Active: ${eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : 'N/A'}`)
            }
          } else {
            console.log(`[Server] No matching markets found for ${pair} ${timeframe}`)
            // Show sample of what we have
            const sampleMarkets = allMarkets.slice(0, 3)
            sampleMarkets.forEach(m => {
              if (m.metadata) {
                console.log(`[Server] Sample market: ${m.metadata.question} (${m.metadata.eventTimeframe || 'no timeframe'})`)
              }
            })
          }
        }
        
        // Get debug info - check all matching markets to see why they're filtered
        let debugInfo: any = null
        if (matchingMarkets.length > 0) {
          const inWindowMarkets: any[] = []
          
          for (const market of matchingMarkets.slice(0, 5)) {
            if (!market.metadata) continue
            const { eventStart, eventEnd } = parseEventTime(market.metadata)
            if (eventStart && eventEnd) {
              const isInWindow = now >= eventStart && now < eventEnd
              if (isInWindow) {
                const isSettled = market.bestBid !== null && market.bestAsk !== null && 
                                 ((market.bestBid <= 0.02 && market.bestAsk >= 0.98) || 
                                  (market.bestBid >= 0.98 && market.bestAsk <= 0.02))
                inWindowMarkets.push({
                  question: market.metadata.question,
                  marketId: market.marketId,
                  tokenId: market.metadata.tokenId,
                  bestBid: market.bestBid,
                  bestAsk: market.bestAsk,
                  isSettled,
                  hasPrices: market.bestBid !== null && market.bestAsk !== null,
                  eventStart: new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                  eventEnd: new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                })
              }
            }
          }
          
          const sampleMarket = matchingMarkets[0]
          if (sampleMarket.metadata) {
            const { eventStart, eventEnd } = parseEventTime(sampleMarket.metadata)
            debugInfo = {
              sampleMarket: sampleMarket.metadata.question,
              currentTime: new Date(now).toISOString(),
              currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
              parsedEventStart: eventStart ? new Date(eventStart).toISOString() : null,
              parsedEventStartET: eventStart ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              parsedEventEnd: eventEnd ? new Date(eventEnd).toISOString() : null,
              parsedEventEndET: eventEnd ? new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
              timeUntilStart: eventStart ? ((eventStart - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
              timeUntilEnd: eventEnd ? ((eventEnd - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
              isInWindow: eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : null,
              inWindowMarkets: inWindowMarkets,
              totalMatching: matchingMarkets.length,
              marketsWithWindows: marketsWithWindows.length,
            }
          }
        }

        console.log(
          `[Server] Final check: currentMarket=${currentMarket ? 'exists' : 'null'}, hasMetadata=${
            currentMarket?.metadata ? 'yes' : 'no'
          }`
        )
        
        if (currentMarket && currentMarket.metadata) {
          // Use eventStart/eventEnd from selectedMarketWindow (which has slug timestamp adjustment)
          // Fallback to parsing question text if selectedMarketWindow not available
          const eventStart = selectedMarketWindow?.eventStart || parseEventTime(currentMarket.metadata).eventStart
          const eventEnd = selectedMarketWindow?.eventEnd || parseEventTime(currentMarket.metadata).eventEnd
          
          // Calculate isSettled and isInActiveRange from current market prices
          const bid = currentMarket.bestBid
          const ask = currentMarket.bestAsk
          const hasPrices = bid !== null && bid !== undefined && ask !== null && ask !== undefined
          const isSettled = hasPrices && ((bid <= 0.02 && ask >= 0.98) || (bid >= 0.98 && ask <= 0.02))
          const isInActiveRange = hasPrices && 
            (bid >= 0.10 && bid <= 0.90 && ask >= 0.10 && ask <= 0.90)
          
          console.log(`[Server] Returning market: ${currentMarket.marketId}, isSettled=${isSettled}, isInWindow=${eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : false}`)
          
          res.writeHead(200, { 'Content-Type': 'application/json' })
          const yesTokenId = currentMarket.metadata.yesTokenId || currentMarket.metadata.tokenId || currentMarket.metadata.tokenIds?.[0] || null
          const noTokenId = currentMarket.metadata.noTokenId || currentMarket.metadata.tokenIds?.[1] || null

        // ⚠️ CRITICAL: Using adjusted slug to point to today's market (not tomorrow's)
        // The adjustedSlug is constructed when we detect a 24h offset in the slug timestamp
        // This ensures "View on Polymarket" links point to the correct market
        res.end(JSON.stringify({
          marketId: currentMarket.marketId,
          question: currentMarket.metadata.question,
          tokenId: yesTokenId,
          yesTokenId,
          noTokenId,
          tokenIds: currentMarket.metadata.tokenIds || (yesTokenId ? [yesTokenId, noTokenId].filter(Boolean) : undefined),
          slug: selectedMarketWindow?.adjustedSlug || currentMarket.metadata.slug || null, // Use adjusted slug if available
          bestBid: currentMarket.bestBid,
          bestAsk: currentMarket.bestAsk,
          lastPrice: currentMarket.lastPrice,
          startTime: eventStart || currentMarket.metadata.startTime, // Use adjusted parsed time
          endTime: eventEnd || currentMarket.metadata.endTime, // Use adjusted parsed time
          eventTimeframe: currentMarket.metadata.eventTimeframe,
          isSettled: isSettled,
          isInActiveRange: isInActiveRange,
          debug: {
            parsedEventStart: eventStart ? new Date(eventStart).toISOString() : null,
            parsedEventStartET: eventStart ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
            parsedEventEnd: eventEnd ? new Date(eventEnd).toISOString() : null,
            parsedEventEndET: eventEnd ? new Date(eventEnd).toLocaleString('en-US', { timeZone: 'America/New_York' }) : null,
            currentTime: new Date(now).toISOString(),
            currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
            timeUntilStart: eventStart ? ((eventStart - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
            timeUntilEnd: eventEnd ? ((eventEnd - now) / 1000 / 60).toFixed(1) + ' minutes' : null,
            isInWindow: eventStart && eventEnd ? (now >= eventStart && now < eventEnd) : null,
          }
        }))
        } else {
          // Return 200 with null to indicate no market found (not an error)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ 
            marketId: null,
            question: null,
            tokenId: null,
            yesTokenId: null,
            noTokenId: null,
            slug: null,
            bestBid: null,
            bestAsk: null,
            lastPrice: null,
            startTime: null,
            endTime: null,
            eventTimeframe: null,
            error: 'No active market found',
            debug: {
              currentTime: new Date(now).toISOString(),
              currentTimeET: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
              totalMatching: matchingMarkets.length,
              marketsWithWindows: marketsWithWindows.length,
            }
          }))
        }
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message || 'Invalid request' }))
      }
    })
    return
  }

  // API endpoints for user data (kept for backward compatibility)
  const address = url.searchParams.get('address')
  
  if (!address && path.startsWith('/api/')) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Missing address parameter' }))
    return
  }

  try {
    // These endpoints can be implemented here or delegated to another service
    if (path === '/api/balance' || path === '/api/positions' || path === '/api/orders' || path === '/api/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, data: [] }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: 'Not found' }))
  } catch (error: any) {
    console.error(`Error handling ${path}:`, error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: error.message }))
  }
})

// Create WebSocket server
const wsServer = new WebSocketServer(httpServer, PORT)

// ⚠️⚠️⚠️ CRITICAL: ensureMarketMetadataForPair function - DO NOT MODIFY ⚠️⚠️⚠️
// This function ensures the current market is fetched from Polymarket's API
// It constructs slugs for the current time window and fetches market metadata
// Removing or modifying this will cause markets to not be found
// See: ws-service/MARKET_SELECTION_CRITICAL.md
const ensureMarketMetadataForPair = async (pair?: string, timeframe?: string): Promise<void> => {
  if (!pair || !timeframe) return
  const pairKey = pair.toUpperCase()
  const timeframeKey = timeframe.toLowerCase()
  const pairSlug = PAIR_SLUG_MAP[pairKey]
  const timeframeCfg = TIMEFRAME_CONFIG[timeframeKey]
  if (!pairSlug || !timeframeCfg) return

  const throttleKey = `${pairKey}-${timeframeKey}`
  const now = Date.now()
  // Reduce throttle to 10 seconds to allow more frequent fetching
  if (now - (LAST_SLUG_FETCH[throttleKey] || 0) < 10 * 1000) {
    return
  }
  LAST_SLUG_FETCH[throttleKey] = now
  console.log(`[Server] ensureMarketMetadataForPair called for ${pairKey} ${timeframeKey}`)

  const stateStore = wsServer.getStateStore()

  // For 15m markets: construct slug for the *current* 15m ET window and fetch by slug
  // Slug format (from Gamma / website): "{pairSlug}-updown-15m-{eventStartTimeUtcInSeconds}"
  // Example: "sol-updown-15m-1764351000" → eventStartTime "2025-11-28T17:30:00Z" (12:30PM ET)
  if (timeframeKey === '15m') {
    try {
      // Start of the current 15m window in ET, converted to UTC ms
      const windowStartMs = getEventWindowStart(15)
      const eventStartSeconds = Math.floor(windowStartMs / 1000)
      const slug = generateSlug(pairKey, timeframeKey, eventStartSeconds)

      if (!slug) {
        console.error(`[Server] 15m slug generation failed for ${pairKey}`)
        return
      }

      console.log(
        `[Server] 15m slug lookup for ${pairKey}: ${slug} (windowStartET=${new Date(windowStartMs).toLocaleString(
          'en-US',
          { timeZone: 'America/New_York' }
        )})`
      )

      const marketMetadata = await fetchMarketBySlug(slug)
      if (!marketMetadata) {
        console.log(`[Server] 15m slug lookup returned no market for ${pairKey} slug ${slug}`)
        return
      }

      if (!marketMetadata.tokenIds || marketMetadata.tokenIds.length < 2) {
        console.log(
          `[Server] 15m slug lookup for ${pairKey} slug ${slug} returned insufficient tokenIds (len=${
            marketMetadata.tokenIds?.length ?? 0
          })`
        )
        return
      }

      // Check if we have an existing market entry for this slug/marketId
      const existing = stateStore.getAllMarkets().find(
        (m) => m.marketId === marketMetadata.marketId || m.metadata?.slug === slug
      )

      if (existing) {
        stateStore.setMarketMetadata(existing.marketId, marketMetadata)
        console.log(
          `[Server] Updated current 15m market ${marketMetadata.marketId} for ${pairKey} (slug: ${slug}, eventStartTime: ${
            marketMetadata.eventStartTime ? new Date(marketMetadata.eventStartTime).toISOString() : 'N/A'
          })`
        )
      } else {
        stateStore.setMarketMetadata(marketMetadata.marketId, marketMetadata)
        console.log(
          `[Server] Loaded current 15m market ${marketMetadata.marketId} for ${pairKey} (slug: ${slug}, eventStartTime: ${
            marketMetadata.eventStartTime ? new Date(marketMetadata.eventStartTime).toISOString() : 'N/A'
          })`
        )
      }

      const subscribeId = marketMetadata.yesTokenId || marketMetadata.tokenId || marketMetadata.marketId
      wsServer.getPolymarketConnector().subscribeToMarket(subscribeId)
      return
    } catch (error) {
      console.error(`[Server] Error fetching 15m market via slug for ${pairKey}:`, error)
      return
    }
  }

  // For 1h markets: Use slug-based lookup (original logic)
  const baseStart = getEventWindowStart(timeframeCfg.minutes)
  const intervalMs = timeframeCfg.minutes * 60 * 1000
  const candidateStarts = [
    baseStart,
    baseStart + intervalMs,
    baseStart + intervalMs * 2,
    baseStart + intervalMs * 3,
    baseStart - intervalMs,
    baseStart - intervalMs * 2,
  ]

  for (const startMs of candidateStarts) {
    if (startMs <= 0) continue
    
    // For 1h markets, try both "1h" and "hourly" slug formats
    const slugVariants = [
      generateSlug(pairKey, timeframeKey, Math.floor(startMs / 1000)),
      generateSlug(pairKey, 'hourly', Math.floor(startMs / 1000)),
    ].filter(Boolean) as string[]
    
    for (const slug of slugVariants) {
      if (!slug) continue

      // Skip if we already have metadata with eventStartTime for this slug
      const existingWithMetadata = stateStore.getAllMarkets().find((m) => m.metadata?.slug === slug && m.metadata?.eventStartTime)
      if (existingWithMetadata) continue

      const marketMetadata = await fetchMarketBySlug(slug)
      if (marketMetadata) {
        const alreadyEnded = marketMetadata.endTime && marketMetadata.endTime < Date.now() - intervalMs
        if (alreadyEnded) {
          continue
        }
        // Check if we have an existing market that matches (by slug, marketId, or question)
        const existingBySlug = stateStore.getAllMarkets().find((m) => m.metadata?.slug === slug)
        const existingById = stateStore.getAllMarkets().find((m) => m.marketId === marketMetadata.marketId)
        const existingByQuestion = stateStore.getAllMarkets().find((m) => 
          m.metadata?.question === marketMetadata.question || 
          (!m.metadata && m.marketId && marketMetadata.marketId && m.marketId === marketMetadata.marketId)
        )
        
        const existing = existingBySlug || existingById || existingByQuestion
        if (existing) {
          // Update existing market's metadata
          stateStore.setMarketMetadata(existing.marketId, marketMetadata)
          console.log(`[Server] Updated existing market ${existing.marketId} with metadata from slug ${slug}${marketMetadata.eventStartTime ? ` (eventStartTime: ${new Date(marketMetadata.eventStartTime).toISOString()})` : ' (NO eventStartTime)'}`)
        } else {
          // Create new market entry
          stateStore.setMarketMetadata(marketMetadata.marketId, marketMetadata)
          console.log(`[Server] Created new market ${marketMetadata.marketId} from slug ${slug}${marketMetadata.eventStartTime ? ` (eventStartTime: ${new Date(marketMetadata.eventStartTime).toISOString()})` : ' (NO eventStartTime)'}`)
        }
        const subscribeId = marketMetadata.yesTokenId || marketMetadata.tokenId || marketMetadata.marketId
        wsServer.getPolymarketConnector().subscribeToMarket(subscribeId)
        console.log(`[Server] Loaded market metadata via slug ${slug}${marketMetadata.eventStartTime ? ` (eventStartTime: ${new Date(marketMetadata.eventStartTime).toISOString()})` : ' (NO eventStartTime)'}`)
        if (marketMetadata.acceptingOrders !== false && marketMetadata.closed !== true) {
          break
        }
      }
    }
  }
}

// Poll orderbook data for tracked markets
function startOrderbookPolling(wsServer: WebSocketServer, markets: any[]): void {
  console.log('[Server] Starting orderbook polling for tracked markets...')
  
  const POLL_INTERVAL = 1000 // 1 second - poll every second for real-time feel
  let pollCount = 0
  let errorCount = 0
  
  // Pairs and timeframes we care about (8 markets total)
  const TRACKED_PAIRS = ['BTC', 'SOL', 'ETH', 'XRP']
  const TRACKED_TIMEFRAMES = ['15m', '1h']
  
  setInterval(async () => {
    const stateStore = wsServer.getStateStore()
    const allMarkets = stateStore.getAllMarkets()
    
    if (allMarkets.length === 0) return
    
    pollCount++
    let updatedCount = 0
    
    // Filter to only the 8 active markets we care about (4 pairs × 2 timeframes)
    const now = Date.now()
    const activeMarketsToPoll = allMarkets.filter(m => {
      const metadata = m.metadata
      if (!metadata) return false
      
      // Market must be active (not expired)
      const isActive = !metadata.endTime || metadata.endTime > now
      if (!isActive) return false
      
      // Must have a token ID
      const primaryToken = metadata?.yesTokenId || metadata?.tokenId || metadata?.tokenIds?.[0]
      if (!primaryToken) return false
      
      // Must match one of our tracked pairs
      const question = (metadata.question || '').toUpperCase()
      const pairMap: Record<string, string[]> = {
        'BTC': ['BITCOIN', 'BTC'],
        'SOL': ['SOLANA', 'SOL'],
        'ETH': ['ETHEREUM', 'ETH'],
        'XRP': ['XRP', 'RIPPLE'],
      }
      const matchesPair = TRACKED_PAIRS.some(pair => {
        const variants = pairMap[pair] || [pair]
        return variants.some(variant => question.includes(variant))
      })
      if (!matchesPair) return false
      
      // Must match one of our tracked timeframes
      let marketTimeframe = metadata.eventTimeframe?.toLowerCase() || ''
      if (!marketTimeframe && metadata.slug) {
        if (metadata.slug.includes('-up-or-down-') && metadata.slug.endsWith('-et')) {
          marketTimeframe = '1h'
        } else if (metadata.slug.includes('-1h-') || metadata.slug.includes('-hourly-')) {
          marketTimeframe = '1h'
        } else if (metadata.slug.includes('-15m-')) {
          marketTimeframe = '15m'
        }
      }
      if (marketTimeframe === 'hourly') marketTimeframe = '1h'
      
      const matchesTimeframe = !marketTimeframe || TRACKED_TIMEFRAMES.includes(marketTimeframe)
      
      return matchesTimeframe
    })
    
    // Also get all subscribed tokenIds from clients (in case they subscribed to markets not in our filter)
    const subscribedIds = wsServer.getAllSubscribedIds()
    console.log(`[Server] Polling: ${activeMarketsToPoll.length} filtered markets, ${subscribedIds.size} client subscriptions`)
    
    // Poll ALL active tracked markets every interval (no rotation)
    const marketsToPoll = activeMarketsToPoll
    
    // Collect token IDs for batch fetch
    const tokenIds: string[] = []
    const marketMap = new Map<string, typeof marketsToPoll[0]>()
    const subscribedTokenIds = new Set<string>()
    
    // First, collect tokenIds from filtered markets
    for (const marketState of marketsToPoll) {
      const metadata = marketState.metadata
      const primaryTokenId = metadata?.yesTokenId || metadata?.tokenId || metadata?.tokenIds?.[0]
      if (primaryTokenId) {
        tokenIds.push(primaryTokenId)
        marketMap.set(primaryTokenId, marketState)
      }
    }
    
    // Also add any subscribed tokenIds that aren't already in our list
    for (const subscribedId of subscribedIds) {
      // Check if this is a tokenId (long numeric string) or marketId
      // If it's not in our marketMap, try to fetch it directly
      if (!marketMap.has(subscribedId) && subscribedId.length > 20) {
        // Likely a tokenId - add it to polling
        tokenIds.push(subscribedId)
        subscribedTokenIds.add(subscribedId)
        console.log(`[Server] Adding subscribed tokenId to polling: ${subscribedId.substring(0, 20)}...`)
      }
    }
    
    if (tokenIds.length === 0) return
    
    try {
      // Use batch API for efficiency
      const orderbooks = await fetchMultipleOrderbooks(tokenIds)
      
      // Process results
      for (const [tokenId, orderbook] of orderbooks.entries()) {
        if (!orderbook || orderbook.bids.length === 0 || orderbook.asks.length === 0) {
          continue
        }
        
        const marketState = marketMap.get(tokenId)
        const bestBid = parseFloat(orderbook.bids[0].price)
        const bestAsk = parseFloat(orderbook.asks[0].price)
        
        // Only update if values are valid
        if (!isNaN(bestBid) && !isNaN(bestAsk) && bestBid > 0 && bestAsk > 0) {
          // Convert orderbook data to number arrays for client
          const bidsArray = orderbook.bids.map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
          }))
          const asksArray = orderbook.asks.map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
          }))
          
          // If this is a subscribed tokenId without a marketState, use tokenId as marketId
          const marketId = marketState ? marketState.marketId : tokenId
          
          // Update state if we have marketState
          if (marketState) {
            stateStore.updateMarket({
              type: 'orderbook',
              marketId: marketState.marketId,
              bestBid,
              bestAsk,
            })
          }
          
          // Only broadcast if there are subscribers for this tokenId/marketId
          const hasSubscribers = wsServer.hasSubscribers(marketId) || wsServer.hasSubscribers(tokenId)
          if (!hasSubscribers) {
            continue // Skip broadcasting if no one is subscribed
          }
          
          // Broadcast full orderbook update to clients (by marketId and tokenId)
          const firstBidPrice = bidsArray[0]?.price || 0
          const firstAskPrice = asksArray[0]?.price || 0
          const marketInfo = marketState ? `${marketState.metadata?.question || marketId}` : `tokenId: ${tokenId.substring(0, 20)}...`
          console.log(`[Server] Broadcasting orderbook_update for ${marketInfo}, marketId: ${marketId}, tokenId: ${tokenId.substring(0, 20)}..., bids: ${bidsArray.length}, asks: ${asksArray.length}, bestBid: ${firstBidPrice} (${(firstBidPrice*100).toFixed(0)}c), bestAsk: ${firstAskPrice} (${(firstAskPrice*100).toFixed(0)}c)`)
          wsServer.broadcastOrderbookUpdate(marketId, tokenId, bidsArray, asksArray)
          
          // Also emit for Polymarket connector (for other listeners)
          if (marketState) {
            wsServer.getPolymarketConnector().emit('marketUpdate', {
              type: 'orderbook',
              marketId: marketState.marketId,
              bestBid,
              bestAsk,
            })
          }
          
          updatedCount++
        }
      }
      
      // Fallback: if batch didn't work, try individual fetches for first few
      if (updatedCount === 0 && pollCount <= 2) {
        for (const marketState of marketsToPoll.slice(0, 3)) {
          const metadata = marketState.metadata
          const primaryTokenId = metadata?.yesTokenId || metadata?.tokenId || metadata?.tokenIds?.[0]
          if (!metadata || !primaryTokenId) continue
          
          try {
            const orderbook = await fetchOrderbook(primaryTokenId)
            if (orderbook && orderbook.bids && orderbook.bids.length > 0 && orderbook.asks && orderbook.asks.length > 0) {
              const bestBid = parseFloat(orderbook.bids[0].price)
              const bestAsk = parseFloat(orderbook.asks[0].price)
              
              if (!isNaN(bestBid) && !isNaN(bestAsk) && bestBid > 0 && bestAsk > 0) {
                stateStore.updateMarket({
                  type: 'orderbook',
                  marketId: marketState.marketId,
                  bestBid,
                  bestAsk,
                })
                
                wsServer.getPolymarketConnector().emit('marketUpdate', {
                  type: 'orderbook',
                  marketId: marketState.marketId,
                  bestBid,
                  bestAsk,
                })
                
                updatedCount++
              }
            }
          } catch (error) {
            // Silent fail
          }
        }
      }
    } catch (error: any) {
      errorCount++
      // Log first few errors
      if (pollCount <= 3) {
        console.warn(`[Server] Error in batch orderbook fetch:`, error.message || String(error).substring(0, 100))
      }
    }
    
    // Log every 10 polls (10 seconds) or when we get updates
    if (pollCount % 10 === 0 || updatedCount > 0) {
      const activeCount = activeMarketsToPoll.length
      console.log(`[Server] Polling: Updated ${updatedCount}/${marketsToPoll.length} markets. Active tracked: ${activeCount}. Errors: ${errorCount}`)
    }
  }, POLL_INTERVAL)
  
  console.log(`[Server] Polling orderbook every ${POLL_INTERVAL}ms (all ${TRACKED_PAIRS.length * TRACKED_TIMEFRAMES.length} tracked markets per cycle, batch API)`)
}

// Initialize markets on startup
async function initializeMarkets() {
  console.log('[Server] Fetching initial markets list...')
  try {
    const markets = await fetchMarketsList()
    const stateStore = wsServer.getStateStore()
    
    if (markets.length === 0) {
      console.warn('[Server] No markets fetched - API may be unavailable. Server will continue running.')
      console.warn('[Server] Markets can be added dynamically when clients subscribe.')
      return
    }
    
    // Filter to only active markets (not expired)
    const now = Date.now()
    const activeMarkets = markets.filter(m => {
      // Market is active if it hasn't ended yet, or if endTime is not set
      return !m.endTime || m.endTime > now
    })
    
    console.log(`[Server] Found ${markets.length} total markets, ${activeMarkets.length} are currently active`)
    
    for (const market of activeMarkets) {
      stateStore.setMarketMetadata(market.marketId, market)
      // Subscribe to updates - use token ID for RTDS if available
      const subscribeId = market.yesTokenId || market.tokenId || market.marketId
      wsServer.getPolymarketConnector().subscribeToMarket(subscribeId)
    }
    
    console.log(`[Server] Initialized ${activeMarkets.length} active markets`)
    
    // Start polling for orderbook data (fallback/primary method) - only poll active markets
    startOrderbookPolling(wsServer, activeMarkets)
  } catch (error) {
    console.error('[Server] Error initializing markets:', error)
    console.warn('[Server] Server will continue running - markets can be added dynamically')
  }
}

// Automatically refresh markets for all pairs/timeframes periodically
function startAutomaticMarketRefresh() {
  console.log('[Server] Starting automatic market refresh...')
  
  const pairs = ['BTC', 'SOL', 'ETH', 'XRP']
  const timeframes = ['15m', '1h']
  
  // Refresh 15m markets every 15 minutes
  setInterval(async () => {
    console.log('[Server] Auto-refreshing 15m markets...')
    for (const pair of pairs) {
      try {
        await ensureMarketMetadataForPair(pair, '15m')
      } catch (error) {
        console.error(`[Server] Error auto-refreshing ${pair} 15m:`, error)
      }
    }
  }, 15 * 60 * 1000) // 15 minutes
  
  // Refresh 1h markets every hour
  setInterval(async () => {
    console.log('[Server] Auto-refreshing 1h markets...')
    for (const pair of pairs) {
      try {
        await ensureMarketMetadataForPair(pair, '1h')
      } catch (error) {
        console.error(`[Server] Error auto-refreshing ${pair} 1h:`, error)
      }
    }
  }, 60 * 60 * 1000) // 1 hour
  
  // Also do an initial refresh after 1 minute (to catch any markets that appeared after startup)
  setTimeout(async () => {
    console.log('[Server] Running initial market refresh...')
    for (const pair of pairs) {
      for (const timeframe of timeframes) {
        try {
          await ensureMarketMetadataForPair(pair, timeframe)
        } catch (error) {
          console.error(`[Server] Error in initial refresh ${pair} ${timeframe}:`, error)
        }
      }
    }
  }, 60 * 1000) // 1 minute after startup
}

// Start server
httpServer.listen(HTTP_PORT, () => {
  console.log(`[Server] HTTP server listening on http://localhost:${HTTP_PORT}`)
  console.log(`[Server] WebSocket server listening on ws://localhost:${HTTP_PORT}/ws`)
  console.log(`[Server] Health endpoint: http://localhost:${HTTP_PORT}/health`)
  console.log('\n[Server] Initializing markets...')
  
  initializeMarkets()
  
  // Start automatic market refresh (15m markets every 15min, 1h markets every hour)
  startAutomaticMarketRefresh()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...')
  httpServer.close(() => {
    console.log('[Server] HTTP server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully...')
  httpServer.close(() => {
    console.log('[Server] HTTP server closed')
    process.exit(0)
  })
})

