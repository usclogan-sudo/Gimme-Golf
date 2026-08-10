import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const PRESETS = [
  { id: 'golfer-1', emoji: '🏌️' },
  { id: 'golfer-2', emoji: '🏌️‍♀️' },
  { id: 'golf-ball', emoji: '⛳' },
  { id: 'flag', emoji: '🚩' },
  { id: 'trophy', emoji: '🏆' },
  { id: 'eagle', emoji: '🦅' },
  { id: 'fire', emoji: '🔥' },
  { id: 'money', emoji: '💰' },
  { id: 'diamond', emoji: '💎' },
  { id: 'star', emoji: '⭐' },
]

interface Props {
  currentPreset?: string
  currentUrl?: string
  userId?: string
  onSelect: (preset: string) => void
  onUpload?: (url: string) => void
  onClose: () => void
}

async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      // Center crop to square
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256)
      canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(file)
  })
}

export function AvatarPicker({ currentPreset, userId, onSelect, onUpload, onClose }: Props) {
  const [selected, setSelected] = useState(currentPreset ?? '')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId || !onUpload) return
    setUploading(true)
    setUploadError('')
    try {
      const blob = await resizeImage(file)
      const path = `${userId}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // Add cache-bust to force reload
      onUpload(data.publicUrl + '?t=' + Date.now())
      onClose()
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl mx-4 w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Choose Avatar</h3>

        {/* Photo upload */}
        {userId && onUpload && (
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full h-12 border-2 border-dashed border-amber-300 text-amber-700 font-semibold rounded-xl active:bg-amber-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </button>
            {uploadError && <p className="text-red-500 text-xs mt-1">{uploadError}</p>}
          </div>
        )}

        <div className="grid grid-cols-5 gap-3">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`w-14 h-14 rounded-xl text-2xl flex items-center justify-center transition-all ${
                selected === p.id
                  ? 'bg-amber-100 ring-2 ring-amber-500 scale-110'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {p.emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-12 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl active:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { if (selected) onSelect(selected); onClose() }}
            disabled={!selected}
            className="flex-1 h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy font-semibold rounded-xl disabled:opacity-50 active:bg-gray-900 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/** Render a user's avatar — photo url > preset emoji > initials fallback */
export function UserAvatar({ url, preset, name, size = 'md' }: { url?: string; preset?: string; name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const presetData = preset ? PRESETS.find(p => p.id === preset) : null
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-lg' : size === 'lg' ? 'w-16 h-16 text-4xl' : 'w-10 h-10 text-2xl'
  const imgSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-10 h-10'

  // Priority 1: Photo URL
  if (url) {
    return (
      <img src={url} alt={name ?? 'Avatar'} className={`${imgSize} rounded-full object-cover flex-shrink-0`} />
    )
  }

  // Priority 2: Preset emoji
  if (presetData) {
    return (
      <div className={`${sizeClass} rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0`}>
        {presetData.emoji}
      </div>
    )
  }

  // Priority 3: Initials fallback
  const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?'
  const colors = ['bg-emerald-700', 'bg-teal-700', 'bg-cyan-700', 'bg-blue-700', 'bg-violet-700', 'bg-rose-700']
  let hash = 0
  for (let i = 0; i < (name ?? '').length; i++) hash = (hash * 31 + (name ?? '').charCodeAt(i)) & 0xffffff
  const bg = colors[Math.abs(hash) % colors.length]
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-xl' : 'text-sm'

  return (
    <div className={`${sizeClass} rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
      <span className={`${textSize} font-bold text-white font-display`}>{initials}</span>
    </div>
  )
}
