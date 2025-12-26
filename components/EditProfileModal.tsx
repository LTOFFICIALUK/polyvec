'use client'

import { useState, useEffect } from 'react'
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
  const [errors, setErrors] = useState<{ username?: string; profilePictureUrl?: string }>({})

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
    if (value && value.length > 500) {
      return 'URL is too long'
    }
    if (value && !value.match(/^https?:\/\/.+/)) {
      return 'Invalid URL format'
    }
    return undefined
  }

  const handleUsernameChange = (value: string) => {
    setUsername(value)
    const error = validateUsername(value)
    setErrors((prev) => ({ ...prev, username: error }))
  }

  const handleProfilePictureUrlChange = (value: string) => {
    setProfilePictureUrl(value)
    const error = validateProfilePictureUrl(value)
    setErrors((prev) => ({ ...prev, profilePictureUrl: error }))
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

          {/* Profile Picture URL Field */}
          <div>
            <label htmlFor="profilePictureUrl" className="block text-sm font-medium text-gray-300 mb-2">
              Profile Picture URL
            </label>
            <input
              id="profilePictureUrl"
              type="url"
              value={profilePictureUrl}
              onChange={(e) => handleProfilePictureUrlChange(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className={`w-full bg-dark-bg border ${
                errors.profilePictureUrl ? 'border-red-500' : 'border-gray-700/50'
              } text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent`}
              maxLength={500}
            />
            {errors.profilePictureUrl && (
              <p className="mt-1 text-sm text-red-400">{errors.profilePictureUrl}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Enter a URL to an image (e.g., from Imgur, Cloudinary, etc.)
            </p>
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

