'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, Time } from 'lightweight-charts'

interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface IndicatorValue {
  timestamp: number
  value: number | null
  values?: Record<string, number | null>
}

interface BacktestChartProps {
  asset: string
  timeframe: string
  direction: 'UP' | 'DOWN'
  indicatorType?: string
  indicatorParameters?: Record<string, any>
  marketIds?: string[]
}

const BacktestChart = ({
  asset,
  timeframe,
  direction,
  indicatorType,
  indicatorParameters,
  marketIds = [],
}: BacktestChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const signalLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const histogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [indicatorData, setIndicatorData] = useState<IndicatorValue[]>([])
  
  // Determine if indicator needs its own pane (MACD, Stochastic, etc.)
  const needsSeparatePane = indicatorType === 'MACD' || indicatorType === 'Stochastic' || indicatorType === 'Bollinger Bands'

  // Fetch candle and indicator data
  useEffect(() => {
    const fetchData = async () => {
      if (!asset || !timeframe) return

      setLoading(true)
      setError(null)

      try {
        // Fetch candles and indicator data
        const response = await fetch('/api/backtest/chart-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset,
            timeframe,
            direction,
            indicatorType,
            indicatorParameters,
            marketIds,
          }),
        })

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch chart data')
        }

        setCandles(data.candles || [])
        setIndicatorData(data.indicatorData || [])
      } catch (err: any) {
        console.error('Error fetching chart data:', err)
        setError(err.message || 'Failed to load chart data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [asset, timeframe, direction, indicatorType, JSON.stringify(indicatorParameters), JSON.stringify(marketIds)])

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || loading) return

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove()
    }

    // Create chart with appropriate height (taller if indicator needs separate pane)
    const chartHeight = needsSeparatePane ? 800 : 600
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#141210' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#1a1a1a',
      },
      rightPriceScale: {
        borderColor: '#1a1a1a',
      },
    })

    chartRef.current = chart

    // Add candlestick series to main pane (v5 API)
    try {
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      })
      candlestickSeriesRef.current = candlestickSeries as any

      // Handle indicators that need separate panes (MACD, Stochastic, etc.)
      if (indicatorType === 'MACD' && indicatorData.length > 0) {
        // Create a new pane for MACD (v5 API - addPane() creates a new pane)
        const macdPane = chart.addPane()

        // Add MACD line (blue)
        const macdLine = macdPane.addSeries(LineSeries, {
          color: '#2962FF', // Blue like TradingView
          lineWidth: 1,
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'MACD',
        })
        macdLineSeriesRef.current = macdLine as any

        // Add Signal line (orange)
        const signalLine = macdPane.addSeries(LineSeries, {
          color: '#FF6D00', // Orange like TradingView
          lineWidth: 1,
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'Signal',
        })
        signalLineSeriesRef.current = signalLine as any

        // Add Histogram (bars) - color will be set per-bar based on positive/negative
        const histogram = macdPane.addSeries(HistogramSeries, {
          color: '#26a69a', // Default color (will be overridden per bar)
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'Histogram',
        })
        histogramSeriesRef.current = histogram as any

        // Configure price scale for MACD pane (right price scale)
        const macdPriceScale = macdPane.priceScale('right')
        macdPriceScale.applyOptions({
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        })
        
        // Add zero line to MACD line series
        macdLine.createPriceLine({
          price: 0,
          color: '#666666',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
        })
      } else if (indicatorType && indicatorData.length > 0 && !needsSeparatePane) {
        // For indicators that overlay on main chart (RSI, SMA, EMA, etc.)
        const indicatorSeries = chart.addSeries(LineSeries, {
          color: '#fbbf24',
          lineWidth: 2,
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
          priceLineVisible: false,
          lastValueVisible: true,
          title: indicatorType,
        })
        macdLineSeriesRef.current = indicatorSeries as any
      }
    } catch (err: any) {
      console.error('Error adding series to chart:', err)
      setError(`Failed to initialize chart: ${err.message}`)
    }

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.remove()
      }
    }
  }, [loading, indicatorType, needsSeparatePane])

  // Update chart data
  useEffect(() => {
    if (!candlestickSeriesRef.current || candles.length === 0) return

    // Convert candles to chart format
    const candlestickData: CandlestickData<Time>[] = candles.map((c) => ({
      time: (c.timestamp / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    candlestickSeriesRef.current.setData(candlestickData)

    // Update MACD indicator data (separate pane)
    if (indicatorType === 'MACD' && indicatorData.length > 0) {
      const macdLineData: LineData<Time>[] = []
      const signalLineData: LineData<Time>[] = []
      const histogramData: HistogramData<Time>[] = []

      for (const d of indicatorData) {
        if (d.values && d.values.macd !== null && d.values.macd !== undefined) {
          const time = (d.timestamp / 1000) as Time
          
          // MACD line
          macdLineData.push({
            time,
            value: d.values.macd,
          })
          
          // Signal line
          if (d.values.signal !== null && d.values.signal !== undefined) {
            signalLineData.push({
              time,
              value: d.values.signal,
            })
          }
          
          // Histogram (color based on positive/negative)
          if (d.values.histogram !== null && d.values.histogram !== undefined) {
            histogramData.push({
              time,
              value: d.values.histogram,
              color: d.values.histogram >= 0 ? '#26a69a' : '#ef5350', // Green/cyan for positive, red for negative (like TradingView)
            })
          }
        }
      }

      if (macdLineSeriesRef.current && macdLineData.length > 0) {
        macdLineSeriesRef.current.setData(macdLineData)
      }
      if (signalLineSeriesRef.current && signalLineData.length > 0) {
        signalLineSeriesRef.current.setData(signalLineData)
      }
      if (histogramSeriesRef.current && histogramData.length > 0) {
        histogramSeriesRef.current.setData(histogramData)
      }
    } else if (indicatorType && indicatorData.length > 0 && !needsSeparatePane) {
      // Update overlay indicators (RSI, SMA, EMA, etc.)
      if (macdLineSeriesRef.current) {
        const lineData: LineData<Time>[] = indicatorData
          .filter((d) => d.value !== null && d.value !== undefined)
          .map((d) => ({
            time: (d.timestamp / 1000) as Time,
            value: d.value!,
          }))

        if (lineData.length > 0) {
          macdLineSeriesRef.current.setData(lineData)
        }
      }
    }
  }, [candles, indicatorData, indicatorType, needsSeparatePane])

  if (loading) {
    return (
      <div className="bg-dark-bg border border-gray-800 rounded-lg p-8 flex items-center justify-center" style={{ height: 600 }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-primary mx-auto mb-4"></div>
          <p className="text-gray-400">Loading chart data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-dark-bg border border-gray-800 rounded-lg p-8 flex items-center justify-center" style={{ height: 600 }}>
        <div className="text-center">
          <p className="text-red-400 mb-2">Error loading chart</p>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (candles.length === 0) {
    return (
      <div className="bg-dark-bg border border-gray-800 rounded-lg p-8 flex items-center justify-center" style={{ height: 600 }}>
        <div className="text-center">
          <p className="text-gray-400">No chart data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-bg border border-gray-800 rounded-lg p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {asset} {timeframe} Chart
          </h3>
          {indicatorType && (
            <p className="text-sm text-gray-400">
              Indicator: {indicatorType}
              {indicatorParameters && Object.keys(indicatorParameters).length > 0 && (
                <span className="ml-2">
                  ({Object.entries(indicatorParameters)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')})
                </span>
              )}
            </p>
          )}
        </div>
        <div className="text-sm text-gray-400">
          {candles.length} candles
        </div>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: needsSeparatePane ? 800 : 600 }} />
    </div>
  )
}

export default BacktestChart

