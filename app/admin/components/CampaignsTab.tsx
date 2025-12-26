'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import CustomSelect from './CustomSelect'

interface Campaign {
  id: number
  campaign_id: string
  name: string
  subject: string
  target_audience: string
  status: string
  total_recipients: number
  total_sent: number
  total_opened: number
  total_clicked: number
  sent_at: string | null
  created_at: string
}

export default function CampaignsTab({ preloaded = false }: { preloaded?: boolean }) {
  const { showToast } = useToast()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(!preloaded)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [initialLoad, setInitialLoad] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    htmlContent: '',
    targetAudience: 'all',
    customUserIds: '',
    sendImmediately: false,
  })

  // Pre-load campaigns on mount
  useEffect(() => {
    if (!initialLoad) {
      setInitialLoad(true)
      fetchCampaigns()
    }
  }, [initialLoad])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/emails/campaigns')
      const data = await response.json()

      if (response.ok) {
        setCampaigns(data.campaigns)
      } else {
        showToast(data.error || 'Failed to fetch campaigns', 'error')
      }
    } catch (error) {
      showToast('Failed to fetch campaigns', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCampaign = async () => {
    if (!formData.name || !formData.subject || !formData.htmlContent) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    try {
      setCreating(true)
      const payload: any = {
        name: formData.name,
        subject: formData.subject,
        htmlContent: formData.htmlContent,
        targetAudience: formData.targetAudience,
        sendImmediately: formData.sendImmediately,
      }

      if (formData.targetAudience === 'custom') {
        const userIds = formData.customUserIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
        if (userIds.length === 0) {
          showToast('Please provide valid user IDs', 'error')
          return
        }
        payload.customUserIds = userIds
      }

      const response = await fetch('/api/admin/emails/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (response.ok) {
        showToast(data.message || 'Campaign created successfully', 'success')
        setShowCreateModal(false)
        setFormData({
          name: '',
          subject: '',
          htmlContent: '',
          targetAudience: 'all',
          customUserIds: '',
          sendImmediately: false,
        })
        fetchCampaigns()
      } else {
        showToast(data.error || 'Failed to create campaign', 'error')
      }
    } catch (error) {
      showToast('Failed to create campaign', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Email Campaigns</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-gold-primary border-2 border-gold-primary/50 hover:border-gold-primary text-white text-sm font-medium rounded transition-all duration-200 transform hover:scale-105 focus:outline-none uppercase tracking-wide"
          style={{ fontFamily: 'monospace' }}
        >
          Create Campaign
        </button>
      </div>

      {loading ? (
        <div className="text-white">Loading campaigns...</div>
      ) : (
        <div className="bg-dark-bg/60 border border-gray-700/50 rounded-lg overflow-hidden backdrop-blur-sm">
          <table className="w-full">
            <thead className="bg-dark-bg/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Campaign</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Audience</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Recipients</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Sent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Opened</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Clicked</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                    No campaigns yet. Create your first campaign to get started.
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => (
                  <tr key={campaign.campaign_id} className="hover:bg-dark-bg/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm text-white font-medium">{campaign.name}</div>
                      <div className="text-xs text-gray-400">{campaign.subject}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 capitalize">
                      {campaign.target_audience}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${
                        campaign.status === 'sent' ? 'bg-green-500/20 text-green-500 border border-green-500/30' :
                        campaign.status === 'sending' ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30' :
                        campaign.status === 'draft' ? 'bg-dark-bg/40 text-gray-300 border border-gray-700/50' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {campaign.total_recipients}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {campaign.total_sent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {campaign.total_opened} ({campaign.total_recipients > 0 ? Math.round((campaign.total_opened / campaign.total_recipients) * 100) : 0}%)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {campaign.total_clicked} ({campaign.total_recipients > 0 ? Math.round((campaign.total_clicked / campaign.total_recipients) * 100) : 0}%)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {campaign.sent_at 
                        ? new Date(campaign.sent_at).toLocaleDateString()
                        : new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-dark-bg/95 border border-gray-700/50 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Create Email Campaign</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Campaign Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Product Launch Announcement"
                    className="w-full px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gold-primary backdrop-blur-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email Subject *</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="e.g., Exciting New Features Available Now!"
                    className="w-full px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gold-primary backdrop-blur-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Target Audience *</label>
                  <CustomSelect
                    value={formData.targetAudience}
                    onChange={(value) => setFormData({ ...formData, targetAudience: value })}
                    options={[
                      { value: 'all', label: 'All Users' },
                      { value: 'pro', label: 'Pro Users Only' },
                      { value: 'free', label: 'Free Users Only' },
                      { value: 'custom', label: 'Custom User List' },
                    ]}
                    placeholder="Select Target Audience"
                    className="w-full"
                  />
                </div>

                {formData.targetAudience === 'custom' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">User IDs (comma-separated) *</label>
                    <input
                      type="text"
                      value={formData.customUserIds}
                      onChange={(e) => setFormData({ ...formData, customUserIds: e.target.value })}
                      placeholder="e.g., 1, 2, 3, 4"
                      className="w-full px-4 py-2 bg-dark-bg/60 border border-gray-700/50 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-gold-primary backdrop-blur-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-400 mb-2">HTML Content *</label>
                  <textarea
                    value={formData.htmlContent}
                    onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                    placeholder="Enter HTML email content here..."
                    rows={12}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-md text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold-primary"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    HTML content will be wrapped in the email template automatically
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sendImmediately"
                    checked={formData.sendImmediately}
                    onChange={(e) => setFormData({ ...formData, sendImmediately: e.target.checked })}
                    className="w-4 h-4 text-gold-primary bg-dark-bg/60 border-gray-700/50 rounded focus:ring-gold-primary"
                  />
                  <label htmlFor="sendImmediately" className="text-sm text-white">
                    Send immediately (otherwise save as draft)
                  </label>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={handleCreateCampaign}
                    disabled={creating}
                    className="flex-1 px-4 py-2 bg-gold-primary text-black font-semibold rounded-md hover:bg-gold-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creating...' : formData.sendImmediately ? 'Create & Send' : 'Create Draft'}
                  </button>
                  <button
                    onClick={() => setShowCreateModal(false)}
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

