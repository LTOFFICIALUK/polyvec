'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/contexts/ToastContext'

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  walletAddress: string
  currentUsername?: string | null
  currentProfilePictureUrl?: string | null
  onUpdate: () => void
}

const EditProfileModal = ({
  isOpen,
  onClose,
  walletAddress,
  currentUsername,
  currentProfilePictureUrl,
  onUpdate,
}: EditProfileModalProps) => {
  const { showToast } = useToast()
  const [username, setUsername] = useState(currentUsername || '')
  const [profilePictureUrl, setProfilePictureUrl] = useState(currentProfilePictureUrl || '')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; profilePictureUrl?: string }>({})
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername || '')
      setProfilePictureUrl(currentProfilePictureUrl || '')
      setErrors({})
    }
  }, [isOpen, currentUsername, currentProfilePictureUrl])

  const validateUsername = (value: string): string | undefined => {
    if (value && value.length < 3) {
      return 'Username must be at least 3 characters'
    }
    if (value && value.length > 50) {
      return 'Username must be less than 50 characters'
    }
    if (value && !value.match(/^[a-zA-Z0-9_-]+$/)) {
      return 'Username can only contain letters, numbers, underscores, and hyphens'
    }
    return undefined
  }

  const validateProfilePictureUrl = (value: string): string | undefined => {
    // Only validate if a value exists - must be from our upload (starts with /)
    if (value && !value.startsWith('/')) {
      return 'Invalid profile picture'
    }
    return undefined
  }

  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      showToast('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.', 'error')
      return
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      showToast('File size exceeds 5MB limit', 'error')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/profile/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload image')
      }

      // Set the uploaded image URL
      setProfilePictureUrl(data.url)
      showToast('Image uploaded successfully!', 'success')
    } catch (error: any) {
      console.error('Error uploading image:', error)
      showToast(error.message || 'Failed to upload image', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleRemoveProfilePicture = () => {
    setProfilePictureUrl('')
    setErrors((prev) => ({ ...prev, profilePictureUrl: undefined }))
  }

  const handleUsernameChange = (value: string) => {
    setUsername(value)
    const error = validateUsername(value)
    setErrors((prev) => ({ ...prev, username: error }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate all fields
    const usernameError = validateUsername(username)
    const profilePictureUrlError = validateProfilePictureUrl(profilePictureUrl)

    if (usernameError || profilePictureUrlError) {
      setErrors({
        username: usernameError,
        profilePictureUrl: profilePictureUrlError,
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/profile/${walletAddress}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: username || null,
          profilePictureUrl: profilePictureUrl || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      showToast('Profile updated successfully!', 'success')
      onUpdate()
      onClose()
    } catch (error: any) {
      console.error('Error updating profile:', error)
      showToast(error.message || 'Failed to update profile', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dark-bg border border-gray-700/50 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Field */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="Enter username (optional)"
              className={`w-full bg-dark-bg border ${
                errors.username ? 'border-red-500' : 'border-gray-700/50'
              } text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent`}
              maxLength={50}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-400">{errors.username}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              3-50 characters, letters, numbers, underscores, and hyphens only
            </p>
          </div>

          {/* Profile Picture Upload/URL Field */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="profilePictureUrl" className="block text-sm font-medium text-gray-300">
                Profile Picture
              </label>
              {profilePictureUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveProfilePicture()
                  }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove
                </button>
              )}
            </div>
            
            {/* Drag and Drop Zone */}
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-gold-primary bg-gold-primary/10'
                  : 'border-gray-700/50 hover:border-gray-600 bg-dark-bg/40'
              } ${isUploading ? 'opacity-50 cursor-wait' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />
              
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 animate-spin text-gold-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-sm text-gray-400">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-gray-300">
                    <span className="text-gold-primary hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF, WebP up to 5MB</p>
                </div>
              )}
            </div>

          </div>

          {/* Preview */}
          {(username || profilePictureUrl) && (
            <div className="bg-dark-bg/40 border border-gray-700/50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Preview</p>
              <div className="flex items-center gap-3">
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Profile preview"
                    className="w-12 h-12 rounded-full object-cover border border-gray-700/50"
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username || walletAddress.slice(0, 2))}&background=transparent&color=fff&size=128`
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gold-primary/20 flex items-center justify-center border border-gray-700/50">
                    <span className="text-gold-primary font-semibold text-lg">
                      {(username || walletAddress).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">
                    {username || formatAddress(walletAddress)}
                  </p>
                  <p className="text-xs text-gray-400">{formatAddress(walletAddress)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-dark-bg/40 border border-gray-700/50 text-white rounded text-sm font-medium hover:bg-dark-bg/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !!errors.username || !!errors.profilePictureUrl}
              className="flex-1 px-4 py-2 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white rounded text-sm font-medium transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const formatAddress = (addr: string) => {
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default EditProfileModal

