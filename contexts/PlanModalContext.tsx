'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface PlanModalContextType {
  isOpen: boolean
  openModal: () => void
  closeModal: () => void
}

const PlanModalContext = createContext<PlanModalContextType | undefined>(undefined)

export function PlanModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  return (
    <PlanModalContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
    </PlanModalContext.Provider>
  )
}

export function usePlanModal() {
  const context = useContext(PlanModalContext)
  if (context === undefined) {
    throw new Error('usePlanModal must be used within a PlanModalProvider')
  }
  return context
}

