'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import CustomSelect from './CustomSelect'

interface User {
  id: number
  email: string
  plan_tier: string
  is_admin: boolean
  is_banned: boolean
  ban_reason: string | null
  banned_at: string | null
  wallet_address: string | null
  created_at: string
  last_login: string | null
  plan_updated_at: string | null
}

interface UserDetails extends User {
  subscription: any
  recentPayments: any[]
}

export default function UsersTab({ preloaded = false }: { preloaded?: boolean }) {
  const { showToast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(!preloaded)
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [banFilter, setBanFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [initialLoad, setInitialLoad] = useState(false)
  const [editForm, setEditForm] = useState({
    email: '',
    planTier: '',
    isAdmin: false,
    isBanned: false,
    banReason: '',
  })

  // Pre-load users on mount
  useEffect(() => {
    if (!initialLoad) {
      setInitialLoad(true)
      fetchUsers()
    }
  }, [initialLoad])

  // Fetch when filters change
  useEffect(() => {
    if (initialLoad) {
      fetchUsers()
    }
  }, [page, search, planFilter, banFilter, initialLoad])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })
      if (search) params.append('search', search)
      if (planFilter) params.append('planTier', planFilter)
      if (banFilter) params.append('isBanned', banFilter)

      const response = await fetch(`/api/admin/users?${params}`)
      const data = await response.json()

      if (response.ok) {
        setUsers(data.users)
        setTotalPages(data.pagination.totalPages)
      } else {
        showToast(data.error || 'Failed to fetch users', 'error')
      }
    } catch (error) {
      showToast('Failed to fetch users', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchUserDetails = async (userId: number) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`)
      const data = await response.json()

      if (response.ok) {
        setSelectedUser({
          ...data.user,
          subscription: data.subscription,
          recentPayments: data.recentPayments || [],
        })
      } else {
        showToast(data.error || 'Failed to fetch user details', 'error')
      }
    } catch (error) {
      showToast('Failed to fetch user details', 'error')
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setEditForm({
      email: user.email,
      planTier: user.plan_tier,
      isAdmin: user.is_admin,
      isBanned: user.is_banned,
      banReason: user.ban_reason || '',
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async () => {
    if (!editingUser) return

    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })

      const data = await response.json()

      if (response.ok) {
        showToast('User updated successfully', 'success')
        setShowEditModal(false)
        fetchUsers()
        if (selectedUser?.id === editingUser.id) {
          fetchUserDetails(editingUser.id)
        }
      } else {
        showToast(data.error || 'Failed to update user', 'error')
      }
    } catch (error) {
      showToast('Failed to update user', 'error')
    }
  }

  const handleResetPassword = async (userId: number) => {
    if (!confirm('Send password reset email to this user?')) return

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        showToast('Password reset email sent', 'success')
      } else {
        showToast(data.error || 'Failed to send reset email', 'error')
      }
    } catch (error) {
      showToast('Failed to send reset email', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">User Management</h2>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-primary backdrop-blur-sm"
          />
          <CustomSelect
            value={planFilter}
            onChange={(value) => {
              setPlanFilter(value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All Plans' },
              { value: 'free', label: 'Free' },
              { value: 'pro', label: 'Pro' },
            ]}
            placeholder="All Plans"
            className="w-40"
          />
          <CustomSelect
            value={banFilter}
            onChange={(value) => {
              setBanFilter(value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All Users' },
              { value: 'false', label: 'Active' },
              { value: 'true', label: 'Banned' },
            ]}
            placeholder="All Users"
            className="w-40"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-white">Loading users...</div>
      ) : (
        <>
          <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg overflow-hidden backdrop-blur-sm">
            <table className="w-full">
              <thead className="bg-dark-bg/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-dark-bg/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{user.email}</div>
                      {user.is_admin && (
                        <span className="text-xs text-gold-primary">Admin</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${
                        user.plan_tier === 'pro' 
                          ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/50' 
                          : 'bg-dark-bg/40 text-gray-300 border border-gray-700/50'
                      }`}>
                        {user.plan_tier}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.is_banned ? (
                        <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-500 border border-red-500/30">Banned</span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-500 border border-green-500/30">Active</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchUserDetails(user.id)}
                          className="text-gold-primary hover:text-gold-primary/80 transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-gold-primary hover:text-gold-hover transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleResetPassword(user.id)}
                          className="text-gold-primary hover:text-gold-hover transition-colors"
                        >
                          Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dark-bg/40 transition-colors backdrop-blur-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dark-bg/40 transition-colors backdrop-blur-sm"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-dark-bg/95 border border-gray-700/50 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">User Details</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400">Email</label>
                  <p className="text-white">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Plan Tier</label>
                  <p className="text-white">{selectedUser.plan_tier}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Status</label>
                  <p className="text-white">
                    {selectedUser.is_banned ? 'Banned' : 'Active'}
                    {selectedUser.ban_reason && ` - ${selectedUser.ban_reason}`}
                  </p>
                </div>
                {selectedUser.subscription && (
                  <div>
                    <label className="text-sm text-gray-400">Subscription</label>
                    <p className="text-white">
                      {selectedUser.subscription.status} - 
                      {selectedUser.subscription.current_period_end 
                        ? ` Renews ${new Date(selectedUser.subscription.current_period_end).toLocaleDateString()}`
                        : ' No active subscription'}
                    </p>
                  </div>
                )}
                {selectedUser.recentPayments && selectedUser.recentPayments.length > 0 && (
                  <div>
                    <label className="text-sm text-gray-400">Recent Payments</label>
                    <div className="mt-2 space-y-2">
                      {selectedUser.recentPayments.map((payment: any) => (
                        <div key={payment.id} className="bg-dark-bg/40 p-3 rounded border border-gray-700/30">
                          <p className="text-white">
                            ${(payment.amount / 100).toFixed(2)} - {payment.status} - {payment.reason}
                          </p>
                          <p className="text-sm text-gray-400">
                            {new Date(payment.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-dark-bg/95 border border-gray-700/50 rounded-lg max-w-md w-full backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Edit User</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gold-primary backdrop-blur-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Plan Tier</label>
                  <CustomSelect
                    value={editForm.planTier}
                    onChange={(value) => setEditForm({ ...editForm, planTier: value })}
                    options={[
                      { value: 'free', label: 'Free' },
                      { value: 'pro', label: 'Pro' },
                    ]}
                    placeholder="Select Plan"
                    className="w-full"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isAdmin}
                      onChange={(e) => setEditForm({ ...editForm, isAdmin: e.target.checked })}
                      className="w-4 h-4 text-gold-primary bg-dark-bg/60 border-gray-700/50 rounded focus:ring-gold-primary"
                    />
                    <span className="text-sm text-white">Admin</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isBanned}
                      onChange={(e) => setEditForm({ ...editForm, isBanned: e.target.checked })}
                      className="w-4 h-4 text-gold-primary bg-dark-bg/60 border-gray-700/50 rounded focus:ring-gold-primary"
                    />
                    <span className="text-sm text-white">Banned</span>
                  </label>
                </div>

                {editForm.isBanned && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Ban Reason</label>
                    <input
                      type="text"
                      value={editForm.banReason}
                      onChange={(e) => setEditForm({ ...editForm, banReason: e.target.value })}
                      placeholder="Reason for ban..."
                      className="w-full px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gold-primary backdrop-blur-sm"
                    />
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 px-4 py-2 bg-gold-primary text-black font-semibold rounded-md hover:bg-gold-primary/90 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2 bg-dark-bg/60 border border-gray-700/50 text-white font-semibold rounded-md hover:bg-dark-bg/40 transition-colors backdrop-blur-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

