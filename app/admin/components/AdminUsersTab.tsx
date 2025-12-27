'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'

interface AdminUser {
  id: number
  email: string
  is_admin: boolean
  created_at: string
  last_login: string | null
}

export default function AdminUsersTab() {
  const { showToast } = useToast()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)
  const [removingAdmin, setRemovingAdmin] = useState<number | null>(null)

  const fetchAdmins = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/users/manage')
      
      if (!response.ok) {
        throw new Error('Failed to fetch admin users')
      }

      const data = await response.json()
      setAdmins(data.admins || [])
    } catch (error) {
      console.error('[AdminUsers] Error fetching admins:', error)
      showToast('Failed to load admin users', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAdmins()
  }, [])

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) {
      showToast('Please enter an email address', 'error')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newAdminEmail.trim())) {
      showToast('Please enter a valid email address', 'error')
      return
    }

    try {
      setAddingAdmin(true)
      const response = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newAdminEmail.trim(),
          isAdmin: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add admin')
      }

      showToast(data.message || 'Admin access granted successfully', 'success')
      setNewAdminEmail('')
      await fetchAdmins()
    } catch (error: any) {
      console.error('[AdminUsers] Error adding admin:', error)
      showToast(error.message || 'Failed to add admin user', 'error')
    } finally {
      setAddingAdmin(false)
    }
  }

  const handleRemoveAdmin = async (adminId: number, email: string) => {
    if (!confirm(`Are you sure you want to remove admin access from ${email}?`)) {
      return
    }

    try {
      setRemovingAdmin(adminId)
      const response = await fetch('/api/admin/users/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          isAdmin: false,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove admin')
      }

      showToast(data.message || 'Admin access removed successfully', 'success')
      await fetchAdmins()
    } catch (error: any) {
      console.error('[AdminUsers] Error removing admin:', error)
      showToast(error.message || 'Failed to remove admin user', 'error')
    } finally {
      setRemovingAdmin(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold-primary"></div>
          <p className="mt-4 text-gray-400">Loading admin users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Admin Users</h2>
        <p className="text-sm text-gray-400">
          Manage which users have admin access to the dashboard
        </p>
      </div>

      {/* Add Admin Section */}
      <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Add Admin User</h3>
        <div className="flex gap-3">
          <input
            type="email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !addingAdmin) {
                handleAddAdmin()
              }
            }}
            placeholder="Enter email address"
            className="flex-1 px-4 py-2 bg-dark-bg border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary focus:border-transparent"
            disabled={addingAdmin}
          />
          <button
            onClick={handleAddAdmin}
            disabled={addingAdmin || !newAdminEmail.trim()}
            className="px-6 py-2 bg-gold-primary hover:bg-gold-hover text-white font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addingAdmin ? 'Adding...' : 'Add Admin'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The user must have an account. Admin access will be granted immediately.
        </p>
      </div>

      {/* Admin Users List */}
      <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700/50">
          <h3 className="text-lg font-semibold text-white">
            Current Admin Users ({admins.length})
          </h3>
        </div>

        {admins.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400">No admin users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-bg/40 border-b border-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Account Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {admins.map((admin) => (
                  <tr
                    key={admin.id}
                    className="hover:bg-dark-bg/40 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-white font-medium">{admin.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-400 text-sm">
                        {formatDate(admin.created_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-400 text-sm">
                        {formatDate(admin.last_login)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleRemoveAdmin(admin.id, admin.email)}
                        disabled={removingAdmin === admin.id}
                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {removingAdmin === admin.id ? 'Removing...' : 'Remove Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-blue-300">
            <p className="font-semibold mb-1">Admin Access Information</p>
            <ul className="list-disc list-inside space-y-1 text-blue-400">
              <li>Admin users have full access to the admin dashboard</li>
              <li>You cannot remove your own admin status</li>
              <li>The user must have an existing account to be granted admin access</li>
              <li>Changes take effect immediately</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

