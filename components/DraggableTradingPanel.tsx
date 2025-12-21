'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'

interface DraggableTradingPanelProps {
  children: ReactNode
  initialX?: number
  initialY?: number
}

const DraggableTradingPanel = ({ children, initialX = 50, initialY = 100 }: DraggableTradingPanelProps) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isCollapsed, setIsCollapsed] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't drag if another panel is already being dragged (check for dragging-panel class)
    if (document.body.classList.contains('dragging-panel') && !isDragging) {
      return
    }
    // Don't drag if clicking on the eye icon or three dots
    if ((e.target as HTMLElement).closest('.eye-icon') || (e.target as HTMLElement).closest('.three-dots')) {
      return
    }
    // Don't drag if clicking on the quick limit panel or any of its children
    if ((e.target as HTMLElement).closest('#quick-limit-panel') ||
        (e.target as HTMLElement).closest('.quick-limit-drag-handle')) {
      return
    }
    // Only drag from the header area - make sure it's THIS panel's drag-handle
    const dragHandle = (e.target as HTMLElement).closest('.drag-handle')
    if (dragHandle && panelRef.current && panelRef.current.contains(dragHandle)) {
      // Double-check it's not the quick limit panel's drag handle
      if ((e.target as HTMLElement).closest('.quick-limit-drag-handle')) {
        return
      }
      e.stopPropagation() // Prevent event from bubbling to other panels
      e.preventDefault() // Prevent default behavior
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      })
    }
  }

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsCollapsed(!isCollapsed)
  }

  useEffect(() => {
    if (!isDragging) {
      // Remove drag class when not dragging
      document.body.classList.remove('dragging-panel')
      return
    }

    // Add class to body to disable chart interactions
    document.body.classList.add('dragging-panel')

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStart.x
      const newY = e.clientY - dragStart.y

      // Constrain to viewport
      if (panelRef.current) {
        const panelWidth = panelRef.current.offsetWidth
        const panelHeight = panelRef.current.offsetHeight
        const maxX = window.innerWidth - panelWidth
        const maxY = window.innerHeight - panelHeight

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        })
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
  }, [isDragging, dragStart])

  return (
    <div
      ref={panelRef}
      className="fixed z-50 select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translateZ(0)',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className={`bg-dark-bg border border-gray-700/50 rounded-lg w-[380px] ${isCollapsed ? '' : 'max-h-[85vh]'} flex flex-col backdrop-blur-sm`}>
        {/* Drag Handle Header */}
        <div className={`drag-handle cursor-grab active:cursor-grabbing px-4 py-2.5 ${isCollapsed ? '' : 'border-b border-gray-700/50'} flex items-center justify-between bg-dark-bg/40 hover:bg-dark-bg/60 transition-colors`}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gold-primary/60"></div>
            <span className="text-xs font-medium text-gray-300 tracking-wider uppercase" style={{ fontFamily: 'monospace' }}>
              TRADE INTERFACE
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Eye Icon Toggle */}
            <button
              onClick={handleToggleCollapse}
              className="eye-icon p-1 text-gray-400 hover:text-white transition-colors"
              aria-label={isCollapsed ? 'Show panel' : 'Hide panel'}
              title={isCollapsed ? 'Show panel' : 'Hide panel'}
            >
              {isCollapsed ? (
                // Closed eye icon (when collapsed)
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                // Open eye icon (when expanded)
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
            {/* Three dots */}
            <div className="three-dots flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
            </div>
          </div>
        </div>
        
        {/* Panel Content */}
        {!isCollapsed && (
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export default DraggableTradingPanel

