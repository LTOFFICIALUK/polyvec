'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, Time } from 'lightweight-charts'

interface IndicatorData {
  timestamp: number
  value: number | null
  values: Record<string, number> | null
}

interface IndicatorCache {
  indicator_type: string
  indicator_params: Record<string, any>
  data: IndicatorData[]
  latest_timestamp: number
  count: number
}

interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export default function AdminIndicatorsPage() {
  const router = useRouter()
  const [asset, setAsset] = useState('BTC')
  const [timeframe, setTimeframe] = useState('15m')
  const [indicators, setIndicators] = useState<IndicatorCache[]>([])
  const [selectedIndicator, setSelectedIndicator] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  
  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const indicatorSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const signalLineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const histogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load indicators from cache
      const indicatorsRes = await fetch(`/api/admin/indicators?asset=${asset}&timeframe=${timeframe}`)
      const indicatorsData = await indicatorsRes.json()
      if (!indicatorsRes.ok) throw new Error(indicatorsData.error || 'Failed to load indicators')
      setIndicators(indicatorsData.indicators || [])
      
      // Auto-select first indicator if none selected
      if (!selectedIndicator && indicatorsData.indicators && indicatorsData.indicators.length > 0) {
        const firstInd = indicatorsData.indicators[0]
        setSelectedIndicator(`${firstInd.indicator_type}_${JSON.stringify(firstInd.indicator_params)}`)
      }
      
      // Load price candles from our VPS database
      const symbolMap: Record<string, string> = {
        BTC: 'btcusdt',
        ETH: 'ethusdt',
        SOL: 'solusdt',
        XRP: 'xrpusdt',
      }
      const symbol = symbolMap[asset] || 'btcusdt'
      const candlesRes = await fetch(`/api/crypto/candles?symbol=${symbol}&timeframe=${timeframe}&count=200`)
      const candlesData = await candlesRes.json()
      if (candlesData.candles) {
        setCandles(candlesData.candles)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, timeframe])

  // Get selected indicator data
  const getSelectedIndicatorData = () => {
    if (!selectedIndicator) return null
    const [indicatorType, paramsStr] = selectedIndicator.split('_')
    return indicators.find(
      ind => ind.indicator_type === indicatorType && 
      JSON.stringify(ind.indicator_params) === paramsStr
    )
  }

  const selectedData = getSelectedIndicatorData()
  // Indicators that need separate panes (bottom indicators)
  const needsSeparatePane = selectedData?.indicator_type === 'MACD' || 
                            selectedData?.indicator_type === 'Stochastic' ||
                            selectedData?.indicator_type === 'Bollinger Bands'

  // Initialize chart with our database data
  useEffect(() => {
    if (!chartContainerRef.current || loading || candles.length === 0) return

    // Clean up existing chart
    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (error) {
        // Chart may already be disposed, ignore error
        console.log('[AdminChart] Chart already disposed, skipping cleanup')
      }
      chartRef.current = null
    }

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

    // Add candlestick series with our price data
    try {
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      })
      candlestickSeriesRef.current = candlestickSeries as any

      // Convert candles to chart format
      const chartData: CandlestickData[] = candles.map(c => ({
        time: (c.timestamp / 1000) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candlestickSeries.setData(chartData)

      // Add indicator overlay if selected
      if (selectedData && selectedData.data.length > 0) {
        if (selectedData.indicator_type === 'MACD' && selectedData.data[0].values) {
          // MACD needs separate pane
          const macdPane = chart.addPane()

          // MACD line
          const macdLine = macdPane.addSeries(LineSeries, {
            color: '#2962FF',
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

          // Signal line
          const signalLine = macdPane.addSeries(LineSeries, {
            color: '#FF6D00',
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

          // Histogram
          const histogram = macdPane.addSeries(HistogramSeries, {
            color: '#26a69a',
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

          // Configure price scale for MACD pane
          const macdPriceScale = macdPane.priceScale('right')
          macdPriceScale.applyOptions({
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
          })

          // Add zero line
          macdLine.createPriceLine({
            price: 0,
            color: '#666666',
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
          })

          // Set MACD data
          const macdData: LineData[] = []
          const signalData: LineData[] = []
          const histogramData: HistogramData[] = []

          selectedData.data.forEach(d => {
            if (d.values) {
              const time = (d.timestamp / 1000) as Time
              if (d.values.macd !== null && d.values.macd !== undefined) {
                macdData.push({ time, value: d.values.macd })
              }
              if (d.values.signal !== null && d.values.signal !== undefined) {
                signalData.push({ time, value: d.values.signal })
              }
              if (d.values.histogram !== null && d.values.histogram !== undefined) {
                histogramData.push({
                  time,
                  value: d.values.histogram,
                  color: d.values.histogram >= 0 ? '#26a69a' : '#ef5350',
                })
              }
            }
          })

          macdLine.setData(macdData)
          signalLine.setData(signalData)
          histogram.setData(histogramData)
        } else if (selectedData.indicator_type === 'Stochastic' && selectedData.data[0].values) {
          // Stochastic needs separate pane
          const stochPane = chart.addPane()

          // %K line
          const kLine = stochPane.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 1,
            priceFormat: {
              type: 'price',
              precision: 2,
              minMove: 0.01,
            },
            priceLineVisible: false,
            lastValueVisible: true,
            title: '%K',
          })

          // %D line
          const dLine = stochPane.addSeries(LineSeries, {
            color: '#FF6D00',
            lineWidth: 1,
            priceFormat: {
              type: 'price',
              precision: 2,
              minMove: 0.01,
            },
            priceLineVisible: false,
            lastValueVisible: true,
            title: '%D',
          })

          // Configure price scale (0-100 range)
          const stochPriceScale = stochPane.priceScale('right')
          stochPriceScale.applyOptions({
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
          })

          // Add overbought/oversold lines
          kLine.createPriceLine({
            price: 80,
            color: '#ef5350',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Overbought',
          })
          kLine.createPriceLine({
            price: 20,
            color: '#26a69a',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Oversold',
          })

          // Set Stochastic data
          const kData: LineData[] = []
          const dData: LineData[] = []

          selectedData.data.forEach(d => {
            if (d.values) {
              const time = (d.timestamp / 1000) as Time
              if (d.values.k !== null && d.values.k !== undefined) {
                kData.push({ time, value: d.values.k })
              }
              if (d.values.d !== null && d.values.d !== undefined) {
                dData.push({ time, value: d.values.d })
              }
            }
          })

          kLine.setData(kData)
          dLine.setData(dData)
        } else if (selectedData.indicator_type === 'Bollinger Bands' && selectedData.data[0].values) {
          // Bollinger Bands overlay on main chart (upper, middle, lower bands)
          const upperBand = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 1,
            lineStyle: 2, // Dashed
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Upper Band',
          })

          const middleBand = chart.addSeries(LineSeries, {
            color: '#FF6D00',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Middle Band',
          })

          const lowerBand = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 1,
            lineStyle: 2, // Dashed
            priceLineVisible: false,
            lastValueVisible: true,
            title: 'Lower Band',
          })

          // Set Bollinger Bands data
          const upperData: LineData[] = []
          const middleData: LineData[] = []
          const lowerData: LineData[] = []

          selectedData.data.forEach(d => {
            if (d.values) {
              const time = (d.timestamp / 1000) as Time
              if (d.values.upper !== null && d.values.upper !== undefined) {
                upperData.push({ time, value: d.values.upper })
              }
              if (d.values.middle !== null && d.values.middle !== undefined) {
                middleData.push({ time, value: d.values.middle })
              }
              if (d.values.lower !== null && d.values.lower !== undefined) {
                lowerData.push({ time, value: d.values.lower })
              }
            }
          })

          upperBand.setData(upperData)
          middleBand.setData(middleData)
          lowerBand.setData(lowerData)
        } else {
          // Single-value indicator (RSI, SMA, EMA, etc.) - overlay on main chart
          const indicatorLine = chart.addSeries(LineSeries, {
            color: '#fbbf24',
            lineWidth: 2,
            priceFormat: {
              type: 'price',
              precision: 2,
              minMove: 0.01,
            },
            priceLineVisible: false,
            lastValueVisible: true,
            title: selectedData.indicator_type,
            priceScaleId: 'right',
          })
          indicatorSeriesRef.current = indicatorLine as any

          // For RSI, add overbought/oversold lines
          if (selectedData.indicator_type === 'RSI') {
            indicatorLine.createPriceLine({
              price: 70,
              color: '#ef5350',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: 'Overbought',
            })
            indicatorLine.createPriceLine({
              price: 30,
              color: '#26a69a',
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: 'Oversold',
            })
          }

          const indicatorData: LineData[] = selectedData.data
            .filter(d => d.value !== null && d.value !== undefined)
            .map(d => ({
              time: (d.timestamp / 1000) as Time,
              value: d.value!,
            }))

          indicatorLine.setData(indicatorData)
        }
      }

      chart.timeScale().fitContent()
    } catch (error) {
      console.error('[AdminChart] Error setting up chart:', error)
    }

    return () => {
      if (chartRef.current) {
        try {
          chartRef.current.remove()
        } catch (error) {
          // Chart may already be disposed, ignore error
          console.log('[AdminChart] Chart already disposed during cleanup')
        }
        chartRef.current = null
      }
    }
  }, [candles, selectedData, loading, needsSeparatePane])

  const formatParams = (params: Record<string, any>) => {
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')
  }

  return (
    <div className="bg-dark-bg text-white min-h-screen p-6">
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Indicator Cache Admin</h1>
            <p className="text-sm text-gray-400 mt-1">
              View pre-calculated indicators from VPS cache • Data from our database • Updates every 15 minutes
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded"
          >
            ← Back
          </button>
        </div>

        {/* Controls */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Asset</label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="w-full px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white"
            >
              <option>BTC</option>
              <option>ETH</option>
              <option>SOL</option>
              <option>XRP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white"
            >
              <option>15m</option>
              <option>1h</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Indicator</label>
            <select
              value={selectedIndicator || ''}
              onChange={(e) => setSelectedIndicator(e.target.value || null)}
              className="w-full px-4 py-2 bg-dark-bg border border-gray-800 rounded text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
              style={{ pointerEvents: loading ? 'none' : 'auto', zIndex: 10 }}
            >
              <option value="">Select indicator...</option>
              {indicators.length === 0 && !loading ? (
                <option value="" disabled>No cached indicators available</option>
              ) : (
                indicators.map((ind, idx) => {
                  const key = `${ind.indicator_type}_${JSON.stringify(ind.indicator_params)}`
                  return (
                    <option key={idx} value={key}>
                      {ind.indicator_type} ({formatParams(ind.indicator_params)})
                    </option>
                  )
                })
              )}
            </select>
            {indicators.length === 0 && !loading && (
              <p className="text-xs text-gray-500 mt-1">No cached indicators found. Pre-calculation job runs every 15 minutes.</p>
            )}
          </div>
          <div className="flex items-end">
            <button
              onClick={loadData}
              disabled={loading}
              className="w-full px-4 py-2 bg-gold-primary hover:bg-gold-hover rounded disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Chart with our database data */}
        <div className="mb-6 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">
              {asset} Price Chart ({timeframe}) - <span className="text-gold-primary">From VPS Database</span>
            </h2>
            {selectedData && (
              <div className="text-sm text-gray-400">
                {selectedData.indicator_type} ({formatParams(selectedData.indicator_params)}) • {selectedData.count} cached values
              </div>
            )}
          </div>
          <div 
            ref={chartContainerRef}
            className="w-full bg-dark-bg rounded"
            style={{ height: needsSeparatePane ? '800px' : '600px', minHeight: needsSeparatePane ? '800px' : '600px' }}
          />
          {candles.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Showing {candles.length} candles from VPS database • {selectedData ? `Indicator: ${selectedData.indicator_type} (pre-calculated)` : 'No indicator selected'}
            </p>
          )}
        </div>

        {/* Indicator Data Display */}
        {selectedData && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">
              Cached Indicator Values ({selectedData.indicator_type}) - <span className="text-gold-primary">From VPS Cache</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-950 rounded p-4">
                <div className="text-sm text-gray-400">Total Values</div>
                <div className="text-2xl font-bold text-gold-primary">{selectedData.count}</div>
              </div>
              <div className="bg-gray-950 rounded p-4">
                <div className="text-sm text-gray-400">Latest Update</div>
                <div className="text-lg font-semibold">
                  {new Date(selectedData.latest_timestamp).toLocaleString()}
                </div>
              </div>
              <div className="bg-gray-950 rounded p-4">
                <div className="text-sm text-gray-400">Parameters</div>
                <div className="text-sm font-mono text-gray-300">{formatParams(selectedData.indicator_params)}</div>
              </div>
            </div>
            
            {/* Recent Values Table */}
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-950 sticky top-0">
                  <tr>
                    <th className="text-left p-2 text-gray-400">Timestamp</th>
                    {selectedData.data[0]?.values ? (
                      Object.keys(selectedData.data[0].values || {}).map(key => (
                        <th key={key} className="text-right p-2 text-gray-400 capitalize">{key}</th>
                      ))
                    ) : (
                      <th className="text-right p-2 text-gray-400">Value</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {selectedData.data.slice(-50).reverse().map((d, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-950/50">
                      <td className="p-2 text-gray-400">
                        {new Date(d.timestamp).toLocaleString()}
                      </td>
                      {d.values ? (
                        Object.entries(d.values).map(([key, val]) => (
                          <td key={key} className="text-right p-2 font-mono text-gold-primary">
                            {val?.toFixed(4) || 'null'}
                          </td>
                        ))
                      ) : (
                        <td className="text-right p-2 font-mono text-gold-primary">
                          {d.value?.toFixed(4) || 'null'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {indicators.length === 0 && !loading && !error && (
          <div className="text-center py-12 bg-gray-900/50 border border-gray-800 rounded-lg">
            <p className="text-gray-400 mb-2">No cached indicators found for {asset} {timeframe}</p>
            <p className="text-sm text-gray-500">
              The pre-calculation job runs every 15 minutes and will populate this data shortly.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
