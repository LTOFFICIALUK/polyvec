'use client'

import { useEffect, useRef, useState } from 'react'
import { useTradingContext } from '@/contexts/TradingContext'

const TradingViewChart = () => {
  const { selectedPair, selectedTimeframe } = useTradingContext()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const [widgetId] = useState(() => `tradingview_${Math.random().toString(36).substr(2, 9)}`)
  // Chart-only timeframe (independent from market timeframe)
  const [chartInterval, setChartInterval] = useState(selectedTimeframe)

  // Map asset symbols to TradingView format
  const getTradingViewSymbol = (pair: string): string => {
    const symbolMap: Record<string, string> = {
      BTC: 'BINANCE:BTCUSDT',
      ETH: 'BINANCE:ETHUSDT',
      SOL: 'BINANCE:SOLUSDT',
      XRP: 'BINANCE:XRPUSDT',
    }
    return symbolMap[pair] || 'BINANCE:BTCUSDT'
  }

  // Map timeframe to TradingView interval
  const getInterval = (timeframe: string): string => {
    const intervalMap: Record<string, string> = {
      '15m': '15',
      '1h': '60',
    }
    // Default to 15m but handle other values if passed programmatically
    if (timeframe === '1m') return '1'
    if (timeframe === '5m') return '5'
    if (timeframe === '4h') return '240'
    if (timeframe === '1d') return 'D'
    return intervalMap[timeframe] || '15'
  }

  useEffect(() => {
    if (!containerRef.current) return

    // Clear any existing content
    containerRef.current.innerHTML = ''

    // Build TradingView Advanced Chart URL with black theme customization
    const symbol = getTradingViewSymbol(selectedPair)
    const interval = getInterval(chartInterval)

    // Add custom styles for black background
    const styleId = `tradingview-style-${widgetId}`
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        #${widgetId} {
          background-color: #141210 !important;
        }
        #${widgetId} iframe {
          background-color: #141210 !important;
        }
      `
      document.head.appendChild(style)
    }

    // Use the widget API with toolbar configuration
    const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]')
    
    const initWidget = () => {
      // Ensure container is mounted and attached to DOM
      if (!window.TradingView || !containerRef.current) {
        return
      }

      // Double-check that the container is in the DOM and has an ID set
      if (!containerRef.current.parentElement || !containerRef.current.id) {
        console.warn('[TradingViewChart] Container not ready, retrying...', {
          hasParent: !!containerRef.current.parentElement,
          hasId: !!containerRef.current.id,
        })
        // Retry after a short delay
        setTimeout(() => {
          if (containerRef.current && containerRef.current.parentElement && containerRef.current.id) {
            initWidget()
          }
        }, 100)
        return
      }

      try {
        const widget = new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: interval,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#141210',
          enable_publishing: false,
          allow_symbol_change: false,
          container_id: widgetId,
          height: '100%',
          width: '100%',
          backgroundColor: '#141210',
          gridColor: '#1a1a1a',
          // Hide TradingView's toolbars to avoid grey bars - use custom ChartControls instead
          hide_top_toolbar: true,
          hide_side_toolbar: true,
          hide_legend: false,
          hide_volume: false,
          studies_overrides: {
            'volume.volume.color.0': '#141210',
          },
          overrides: {
            'paneProperties.background': '#141210',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': '#1a1a1a',
            'paneProperties.horzGridProperties.color': '#1a1a1a',
            'symbolWatermarkProperties.transparency': 90,
            'scalesProperties.textColor': '#666666',
            'mainSeriesProperties.candleStyle.upColor': '#10b981',
            'mainSeriesProperties.candleStyle.downColor': '#ef4444',
            'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
            'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
            'paneProperties.topMargin': 10,
            'paneProperties.bottomMargin': 10,
            'scalesProperties.lineColor': '#1a1a1a',
            'paneProperties.legendProperties.showLegend': true,
            'paneProperties.legendProperties.legendBackgroundColor': '#141210',
            'paneProperties.legendProperties.legendTextColor': '#ffffff',
          },
          loading_screen: {
            backgroundColor: '#141210',
          },
          // Use onChartReady callback to control chart programmatically
          onChartReady: () => {
            // Note: We are not relying on the argument here anymore.
            // The widget instance is captured below.
          },
        })
        // Capture the widget instance immediately
        chartRef.current = widget
      } catch (error) {
        console.error('[TradingViewChart] Error initializing widget:', error)
      }
    }

    // Use widget API instead of iframe for better customization
    const loadWidget = () => {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (window.TradingView && containerRef.current && containerRef.current.parentElement) {
          initWidget()
        } else if (window.TradingView) {
          // DOM might not be ready yet, retry after a short delay
          setTimeout(loadWidget, 50)
        }
      })
    }

    if (existingScript) {
      if (window.TradingView) {
        loadWidget()
      } else {
        existingScript.addEventListener('load', loadWidget)
      }
    } else {
      const script = document.createElement('script')
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.onload = loadWidget
      document.body.appendChild(script)
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
      const styleTag = document.getElementById(`tradingview-style-${widgetId}`)
      if (styleTag) {
        styleTag.remove()
      }
      chartRef.current = null
    }
  }, [selectedPair, chartInterval, widgetId])

  // Reset chart interval to market timeframe when market or pair changes
  useEffect(() => {
    setChartInterval(selectedTimeframe)
  }, [selectedTimeframe, selectedPair])

  const handleIntervalChange = (tf: string) => {
    // Only update chart interval, not market timeframe
    setChartInterval(tf)
  }

  // State for toolbar position
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Global drag handlers
  useEffect(() => {
    if (!isDragging) {
      // Remove drag class when not dragging
      document.body.classList.remove('dragging-panel')
      return
    }

    // Add class to body to disable chart interactions
    document.body.classList.add('dragging-panel')

    const handleMouseMove = (e: MouseEvent) => {
        // Calculate new position relative to container
        if (containerRef.current && toolbarRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect()
          // Calculate x/y relative to the container's top-left
          let x = e.clientX - containerRect.left - dragOffset.current.x
          let y = e.clientY - containerRect.top - dragOffset.current.y

          // Constraints
          const toolbarWidth = toolbarRef.current.offsetWidth
          const toolbarHeight = toolbarRef.current.offsetHeight
          const maxX = containerRect.width - toolbarWidth
          const maxY = containerRect.height - toolbarHeight

          x = Math.max(0, Math.min(x, maxX))
          y = Math.max(0, Math.min(y, maxY))

          setToolbarPos({ x, y })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.body.classList.remove('dragging-panel')
    }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.classList.remove('dragging-panel')
    }
  }, [isDragging])

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drag if clicking the drag handle or background, not buttons
    if ((e.target as HTMLElement).closest('button')) return

    if (toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect()
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
      setIsDragging(true)
    }
  }

  return (
    <div className="w-full h-full bg-black relative group">
      {/* Custom Black Toolbar Overlay */}
      <div
        ref={toolbarRef}
        onMouseDown={handleMouseDown}
        style={toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y, bottom: 'auto' } : {}}
        className="absolute bottom-12 left-3 z-20 flex items-center gap-1 bg-dark-bg backdrop-blur-sm p-1 rounded-lg border border-gray-700/50 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="px-1 text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing" title="Drag to move">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 19a2 2 0 100 4 2 2 0 000-4zm0-7a2 2 0 100 4 2 2 0 000-4zm0-7a2 2 0 100 4 2 2 0 000-4zm10 14a2 2 0 100 4 2 2 0 000-4zm0-7a2 2 0 100 4 2 2 0 000-4zm0-7a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
        </div>
        {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
          <button
            key={tf}
            onClick={(e) => {
              e.stopPropagation() // Prevent drag start
              handleIntervalChange(tf)
            }}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              chartInterval === tf
                ? 'bg-gold-primary text-white'
                : 'text-gray-400 hover:text-white hover:bg-dark-bg/60'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <div
        ref={(el) => {
          if (containerRef) {
            (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          }
          if (el && !el.id) {
            el.id = widgetId
          }
        }}
        className="w-full h-full bg-dark-bg"
        style={{ backgroundColor: '#141210' }}
      />
    </div>
  )
}

declare global {
  interface Window {
    TradingView: any
  }
}

export default TradingViewChart

